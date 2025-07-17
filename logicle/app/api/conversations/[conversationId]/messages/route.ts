import { getConversation, getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from 'db/database'

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

// Get a conversation
export const DELETE = requireSession(
  async (session: SimpleSession, req: Request, params: { conversationId: string }) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId != session.userId) {
      return ApiResponses.forbiddenAction()
    }
    const url = new URL(req.url)
    const idsToDeleteParam = url.searchParams.get('ids')
    if (!idsToDeleteParam) {
      return ApiResponses.invalidParameter('Missing ids parameter')
    }
    const idsToDelete = idsToDeleteParam.split(',')

    const storedMessageIds = (await getConversationMessages(params.conversationId)).map((m) => m.id)
    if (idsToDelete.some((id) => !storedMessageIds.includes(id))) {
      return ApiResponses.invalidParameter(
        `At least one message is not part of the specified conversation`
      )
    }
    await db.deleteFrom('Message').where('Message.id', 'in', idsToDelete).execute()
    return ApiResponses.json({})
  }
)
