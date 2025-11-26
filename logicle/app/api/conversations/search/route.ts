import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '@/api/utils/auth'
import { db } from '@/db/database'
import env from '@/lib/env'
import { getConversationsMessages } from '@/models/conversation'
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
    if (indices.length == 0) {
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

export const POST = requireSession(async (session, req) => {
  const query = req.nextUrl.searchParams.get('query')
  if (!query) {
    return ApiResponses.invalidParameter('Missing query parameter')
  }
  const conversations = await search(query, session.userId)

  const messages = (await getConversationsMessages(conversations.map((c) => c.id))).reduce(
    (acc, message) => {
      const conversationId = message.conversationId // change this field name if needed
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
  return ApiResponses.json(conversationWithMessages)
})
