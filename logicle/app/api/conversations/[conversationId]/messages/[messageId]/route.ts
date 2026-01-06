import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { getConversation, getConversationMessage } from '@/models/conversation'
import { db } from 'db/database'
import { messageSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { DELETE, PUT } = route({
  DELETE: operation({
    name: 'Delete conversation message',
    description: 'Delete a message from a conversation.',
    authentication: 'user',
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session }
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
      return new Response(null, { status: 204 })
    },
  }),
  PUT: operation({
    name: 'Update conversation message',
    description: 'Update message content in a conversation.',
    authentication: 'user',
    requestBodySchema: messageSchema,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session, requestBody }
    ) => {
      const putMessage = requestBody
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
      return new Response(null, { status: 204 })
    },
  }),
})
