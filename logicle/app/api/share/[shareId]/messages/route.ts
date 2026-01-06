import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { getConversationMessages } from '@/models/conversation'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  // Get a conversation
  GET: operation({
    name: 'Get shared conversation messages',
    description: 'Fetch messages for a shared conversation.',
    authentication: 'user',
    implementation: async (_req: Request, params: { shareId: string }) => {
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
        .executeTakeFirstOrThrow()
      const messages = await getConversationMessages(conversation.id)
      const linear = extractLinearConversation(
        messages,
        messages.find((m) => m.id === conversation.lastMessageId)!
      )
      return ApiResponses.json(linear)
    },
  }),
})
