import { getConversation, getConversationMessages } from '@/models/conversation'
import { db } from 'db/database'
import { forbidden, noBody, notFound, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { messageSchema } from '@/types/dto/chat'

export const dynamic = 'force-dynamic'

export const { GET, DELETE } = route({
  GET: operation({
    name: 'List messages in conversation',
    description: 'Get messages for a conversation (owned by the session user).',
    authentication: 'user',
    responses: [
      responseSpec(200, messageSchema.array()),
      errorSpec(403),
      errorSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const messages = await getConversationMessages(params.conversationId)
      return ok(messages)
    },
  }),
  DELETE: operation({
    name: 'Delete messages in conversation',
    description: 'Delete messages by id within a conversation (owned by the session user).',
    authentication: 'user',
    responses: [
      responseSpec(204),
      errorSpec(400),
      errorSpec(403),
      errorSpec(404),
    ] as const,
    implementation: async (req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const url = new URL(req.url)
      const idsToDeleteParam = url.searchParams.get('ids')
      if (!idsToDeleteParam) {
        return forbidden('Missing ids parameter')
      }
      const idsToDelete = idsToDeleteParam.split(',')

      const storedMessageIds = (await getConversationMessages(params.conversationId)).map(
        (m) => m.id
      )
      if (idsToDelete.some((id) => !storedMessageIds.includes(id))) {
        return forbidden(`At least one message is not part of the specified conversation`)
      }
      await db.deleteFrom('Message').where('Message.id', 'in', idsToDelete).execute()
      return noBody()
    },
  }),
})
