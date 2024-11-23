import { getConversation, getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'

export const dynamic = 'force-dynamic'

// Get a conversation
export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { conversationId: string }) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId != session.userId) {
      return ApiResponses.forbiddenAction()
    }
    const messages = await getConversationMessages(params.conversationId)
    return ApiResponses.json(messages)
  }
)
