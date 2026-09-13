import { db } from '@/db/database'
import { errorSpec, notFound, ok, operation, responseSpec } from '@/lib/routes'
import { getConversationMessages } from '@/models/conversation'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { messageSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get shared conversation messages',
  description: 'Fetch messages for a shared conversation.',
  authentication: 'user',
  responses: [responseSpec(200, messageSchema.array()), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const conversation = await db
      .selectFrom('ConversationSharing')
      .innerJoin('Message as LastMessage', (join) =>
        join.onRef('LastMessage.id', '=', 'ConversationSharing.lastMessageId')
      )
      .innerJoin('Conversation', (join) =>
        join.onRef('Conversation.id', '=', 'LastMessage.conversationId')
      )
      .where('ConversationSharing.id', '=', params.shareId)
      .selectAll()
      .executeTakeFirst()
    if (!conversation) {
      return notFound(`No shared conversation with id ${params.shareId}`)
    }
    const messages = await getConversationMessages(conversation.id)
    const linear = extractLinearConversation(
      messages,
      messages.find((m) => m.id === conversation.lastMessageId)!
    )
    return ok(linear)
  },
})
