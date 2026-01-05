import { getConversation, getConversationMessage } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from 'db/database'
import { messageSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

// Get a conversation
export const DELETE = requireSession(
  async (
    session: SimpleSession,
    _req: Request,
    params: { conversationId: string; messageId: string }
  ) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction()
    }
    const message = await getConversationMessage(params.messageId)
    if (!message) {
      return ApiResponses.noSuchEntity(`No message with id ${params.messageId}`)
    }
    if (message.conversationId !== conversation.id) {
      return ApiResponses.invalidParameter(`No such message in conversation`)
    }
    const result = await db
      .deleteFrom('Message')
      .where('Message.id', '=', params.messageId)
      .execute()
    if (result.length !== 1 || Number(result[0].numDeletedRows) !== 1) {
      return ApiResponses.internalServerError('No rows modified')
    }
    return ApiResponses.json({})
  }
)

// Get a conversation
export const PUT = requireSession(
  async (
    session: SimpleSession,
    req: Request,
    params: { conversationId: string; messageId: string }
  ) => {
    const parseResult = messageSchema.safeParse(await req.json())
    if (!parseResult.success) {
      return ApiResponses.invalidParameter('Invalid body', parseResult.error.format())
    }
    const putMessage = parseResult.data
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction()
    }
    const message = await getConversationMessage(params.messageId)
    if (!message) {
      return ApiResponses.noSuchEntity(`No message with id ${params.messageId}`)
    }
    if (message.conversationId !== conversation.id) {
      return ApiResponses.invalidParameter(`No such message in conversation`)
    }
    const content = JSON.stringify({
      ...putMessage,
      id: undefined,
      conversationId: undefined,
      parent: undefined,
      role: undefined,
      sentAt: undefined,
    })
    const result = await db
      .updateTable('Message')
      .set({ content: content })
      .where('Message.id', '=', params.messageId)
      .execute()
    if (result.length !== 1 || Number(result[0].numUpdatedRows) !== 1) {
      return ApiResponses.internalServerError('No rows modified')
    }
    return ApiResponses.json({})
  }
)
