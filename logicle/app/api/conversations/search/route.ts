import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '@/api/utils/auth'
import { db } from '@/db/database'
import { getConversationMessagesMulti } from '@/models/conversation'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const POST = requireSession(async (session, req) => {
  const query = req.nextUrl.searchParams.get('query')
  if (!query) {
    return ApiResponses.invalidParameter('Missing query parameter')
  }
  const conversations = await db
    .selectFrom('Conversation')
    .leftJoin('Message', 'Message.conversationId', 'Conversation.id')
    .selectAll('Conversation')
    .where((eb) =>
      eb.or([
        eb('Conversation.name', 'like', `%${query}%`),
        eb('Message.content', 'like', `%${query}%`),
      ])
    )
    .where('Conversation.ownerId', '=', session.userId)
    .distinct()
    .limit(20)
    .execute()

  const messages = (await getConversationMessagesMulti(conversations.map((c) => c.id))).reduce(
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
