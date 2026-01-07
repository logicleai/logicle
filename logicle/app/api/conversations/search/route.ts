import { db } from '@/db/database'
import env from '@/lib/env'
import { getConversationsMessages } from '@/models/conversation'
import { error, ok, operation, responseSpec, route } from '@/lib/routes'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'

export const dynamic = 'force-dynamic'

async function search(query: string, userId: string): Promise<schema.Conversation[]> {
  if (env.search.url) {
    const url = new URL(env.search.url)
    url.searchParams.set('query', query)
    url.searchParams.set('userId', userId)
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      throw new Error(`Search service error: ${res.status} ${res.statusText}`)
    }
    const indices = (await res.json()) as string[]
    if (indices.length === 0) {
      return []
    }
    return await db
      .selectFrom('Conversation')
      .selectAll('Conversation')
      .where('id', 'in', indices)
      .execute()
  } else {
    return await db
      .selectFrom('Conversation')
      .leftJoin('Message', 'Message.conversationId', 'Conversation.id')
      .selectAll('Conversation')
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

export const { POST } = route({
  POST: operation({
    name: 'Search conversations',
    description: 'Search conversations and return conversations with messages.',
    authentication: 'user',
    responses: [responseSpec(200, dto.ConversationWithMessagesSchema.array()), responseSpec(400)] as const,
    implementation: async (req, _params, { session }) => {
      const url = new URL(req.url)
      const query = url.searchParams.get('query')
      if (!query) {
        return error(400, 'Missing query parameter')
      }
      const conversations = await search(query, session.userId)

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
          conversation: { ...c, folderId: (c as any).folderId ?? null },
          messages: messages[c.id] ?? [],
        }
      })
      return ok(conversationWithMessages)
    },
  }),
})
