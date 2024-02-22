import { getConversation, getConversationMessages } from 'models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '@/app/api/utils/auth'

export const dynamic = 'force-dynamic'

// Get a conversation
export const GET = requireSession(
  async (session, req: Request, route: { params: { conversationId: string } }) => {
    const conversation = await getConversation(route.params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${route.params.conversationId}`)
    }
    if (conversation.ownerId != session?.user.id) {
      return ApiResponses.forbiddenAction()
    }
    const messages = await getConversationMessages(route.params.conversationId)
    return ApiResponses.json(messages)
  }
)
