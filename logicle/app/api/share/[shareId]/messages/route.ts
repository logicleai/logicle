import { getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'

export const dynamic = 'force-dynamic'

// Get a conversation
export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { shareId: string }) => {
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
      messages.find((m) => m.id == conversation.lastMessageId)!
    )
    return ApiResponses.json(linear)
  }
)
