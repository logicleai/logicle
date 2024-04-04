import { getConversation, deleteConversation, updateConversation } from 'models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

// Get a conversation
export const GET = requireSession(
  async (session, req: Request, route: { params: { conversationId: string } }) => {
    const conversation = await getConversation(route.params.conversationId)
    if (conversation == null) {
      return ApiResponses.noSuchEntity('There is not a conversation with this ID')
    }
    if (conversation.ownerId != session.user.id) {
      return ApiResponses.forbiddenAction(
        `Not authorized to look at conversation with id ${route.params.conversationId}`
      )
    }
    return ApiResponses.json(conversation)
  }
)

// Modify a conversation
export const PATCH = requireSession(
  async (session, req: Request, route: { params: { conversationId: string } }) => {
    const conversationId = route.params.conversationId

    const data = (await req.json()) as Partial<dto.Conversation>
    const storedConversation = await getConversation(conversationId)
    if (!storedConversation) {
      return ApiResponses.noSuchEntity('Trying to modify non existing conversation')
    }
    if (storedConversation.ownerId != session.user.id) {
      return ApiResponses.forbiddenAction('Not the owner of this conversation')
    }
    if (data.id && data.id != conversationId) {
      return ApiResponses.forbiddenAction("Can't change the id of the conversation")
    }
    if (data.ownerId && data.ownerId != session.user.id) {
      return ApiResponses.forbiddenAction("Can't change the owner of the conversation")
    }
    await updateConversation(conversationId, data)
    return ApiResponses.success()
  }
)

// Delete a conversation
export const DELETE = requireSession(
  async (session, req: Request, route: { params: { conversationId: string } }) => {
    const storedConversation = await getConversation(route.params.conversationId)
    if (!storedConversation) {
      return ApiResponses.noSuchEntity('Trying to delete a non existing conversation')
    }
    if (storedConversation.ownerId != session.user.id) {
      return ApiResponses.forbiddenAction("Can't delete a conversation you don't own")
    }
    await deleteConversation(route.params.conversationId)
    return ApiResponses.success()
  }
)
