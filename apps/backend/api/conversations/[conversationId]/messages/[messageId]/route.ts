import {
  error,
  forbidden,
  noBody,
  notFound,
  operation,
  responseSpec,
  errorSpec,
  route,
} from '@/lib/routes'
import { getConversation, getConversationMessage } from '@/models/conversation'
import { db } from 'db/database'
import { messageSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { DELETE, PUT } = route({
  DELETE: operation({
    name: 'Delete conversation message',
    description: 'Delete a message from a conversation.',
    authentication: 'user',
    responses: [
      responseSpec(204),
      errorSpec(400),
      errorSpec(403),
      errorSpec(404),
      errorSpec(500),
    ] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const message = await getConversationMessage(params.messageId)
      if (!message) {
        return notFound(`No message with id ${params.messageId}`)
      }
      if (message.conversationId !== conversation.id) {
        return error(400, `No such message in conversation`)
      }
      const result = await db
        .deleteFrom('Message')
        .where('Message.id', '=', params.messageId)
        .execute()
      if (result.length !== 1 || Number(result[0].numDeletedRows) !== 1) {
        return error(500, 'No rows modified')
      }
      return noBody()
    },
  }),
  PUT: operation({
    name: 'Update conversation message',
    description: 'Update message content in a conversation.',
    authentication: 'user',
    requestBodySchema: messageSchema,
    responses: [
      responseSpec(204),
      errorSpec(400),
      errorSpec(403),
      errorSpec(404),
      errorSpec(500),
    ] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session, requestBody }
    ) => {
      const putMessage = requestBody
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const message = await getConversationMessage(params.messageId)
      if (!message) {
        return notFound(`No message with id ${params.messageId}`)
      }
      if (message.conversationId !== conversation.id) {
        return error(400, `No such message in conversation`)
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
        return error(500, 'No rows modified')
      }
      return noBody()
    },
  }),
})
