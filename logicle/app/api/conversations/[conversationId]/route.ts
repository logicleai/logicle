import { getConversation, deleteConversation, updateConversation } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

// Get a conversation
export const GET = requireSession(
  async (session, _req: Request, params: { conversationId: string }) => {
    const conversation = await getConversation(params.conversationId)
    if (conversation == null) {
      return ApiResponses.noSuchEntity('There is not a conversation with this ID')
    }
    if (conversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction(
        `Not authorized to look at conversation with id ${params.conversationId}`
      )
    }
    return ApiResponses.json(conversation)
  }
)

// Modify a conversation
export const PATCH = requireSession(
  async (session, req: Request, params: { conversationId: string }) => {
    const conversationId = params.conversationId

    const result = dto.updateableConversationSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }

    const body = result.data
    const storedConversation = await getConversation(conversationId)
    if (!storedConversation) {
      return ApiResponses.noSuchEntity('Trying to modify non existing conversation')
    }
    if (storedConversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction('Not the owner of this conversation')
    }
    await updateConversation(conversationId, body)
    return ApiResponses.success()
  }
)

// Delete a conversation
export const DELETE = requireSession(
  async (session, _req: Request, params: { conversationId: string }) => {
    const storedConversation = await getConversation(params.conversationId)
    if (!storedConversation) {
      return ApiResponses.noSuchEntity('Trying to delete a non existing conversation')
    }
    if (storedConversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction("Can't delete a conversation you don't own")
    }
    await deleteConversation(params.conversationId)
    return ApiResponses.success()
  }
)
