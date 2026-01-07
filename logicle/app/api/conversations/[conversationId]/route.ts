import { forbidden, noBody, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { deleteConversation, getConversation, updateConversation } from '@/models/conversation'
import { conversationSchema, updateableConversationSchema } from '@/types/dto/chat'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get conversation',
    description: 'Fetch a conversation with messages by id.',
    authentication: 'user',
    responses: [responseSpec(200, conversationSchema), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (conversation == null) {
        return notFound('There is not a conversation with this ID')
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden(`Not authorized to look at conversation with id ${params.conversationId}`)
      }
      return ok(conversation)
    },
  }),
  PATCH: operation({
    name: 'Update conversation',
    description: 'Update a conversation by id.',
    authentication: 'user',
    requestBodySchema: updateableConversationSchema,
    responses: [responseSpec(200, z.object({ id: z.string() })), responseSpec(403), responseSpec(404)] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string },
      { session, requestBody }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound()
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      await updateConversation(params.conversationId, requestBody)
      return ok({ id: params.conversationId })
    },
  }),
  DELETE: operation({
    name: 'Delete conversation',
    description: 'Delete a conversation by id.',
    authentication: 'user',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound()
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      await deleteConversation(params.conversationId)
      return noBody()
    },
  }),
})
