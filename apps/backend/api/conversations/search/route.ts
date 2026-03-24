import { db } from '@/db/database'
import env from '@/lib/env'
import { getConversationsMessages } from '@/models/conversation'
import { error, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import * as dto from '@/types/dto'
import { z } from 'zod'
import { MeiliSearchIndex } from '@/lib/search/MeiliIndex'

export const dynamic = 'force-dynamic'

async function search(query: string, userId: string): Promise<dto.ConversationWithFolderId[]> {
  if (env.search.meiliHost) {
    const index = await MeiliSearchIndex.create()
    const hits = await index.searchConversations(query, { ownerId: userId })
    const ids = hits.map((h) => h.id)
    if (ids.length === 0) return []
    return db
      .selectFrom('Conversation')
      .leftJoin('ConversationFolderMembership', (join) =>
        join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
      )
      .selectAll('Conversation')
      .select('ConversationFolderMembership.folderId')
      .where('id', 'in', ids)
      .execute()
  } else {
    return db
      .selectFrom('Conversation')
      .leftJoin('Message', 'Message.conversationId', 'Conversation.id')
      .leftJoin('ConversationFolderMembership', (join) =>
        join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
      )
      .selectAll('Conversation')
      .select('ConversationFolderMembership.folderId')
      .where((eb) =>
        eb.or([
          eb('Conversation.name', 'like', `%${query}%`),
          eb('Message.content', 'like', `%${query}%`),
        ])
      )
      .where('Conversation.ownerId', '=', userId)
      .distinct()
      .limit(20)
      .execute()
  }
}

export const POST = operation({
  name: 'Search conversations',
  description: 'Search conversations and return conversations with messages.',
  authentication: 'user',
  querySchema: z.object({
    query: z.string().optional(),
  }),
  responses: [
    responseSpec(200, dto.ConversationWithMessagesSchema.array()),
    errorSpec(400),
  ] as const,
  implementation: async ({ session, query }) => {
    const searchQuery = query.query
    if (!searchQuery) {
      return error(400, 'Missing query parameter')
    }
    const conversations = await search(searchQuery, session.userId)

    const messages = (await getConversationsMessages(conversations.map((c) => c.id))).reduce(
      (acc, message) => {
        const conversationId = message.conversationId
        if (!acc[conversationId]) {
          acc[conversationId] = []
        }
        acc[conversationId].push(message)
        return acc
      },
      {} as Record<string, dto.Message[]>
    )
    const conversationWithMessages: dto.ConversationWithMessages[] = conversations.map((c) => {
      return {
        conversation: c,
        messages: messages[c.id] ?? [],
      }
    })
    return ok(conversationWithMessages)
  },
})
