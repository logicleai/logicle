import ApiResponses from '@/api/utils/ApiResponses'
import { operation, route } from '@/lib/routes'
import {
  deleteConversation,
  getConversation,
  getConversationMessages,
  updateConversation,
} from '@/models/conversation'
import * as dto from '@/types/dto'
import { updateableConversationSchema } from '@/types/dto/chat'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get conversation',
    description: 'Fetch a conversation with messages by id.',
    authentication: 'user',
    responseBodySchema: z.any(),
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
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
    },
  }),
  PATCH: operation({
    name: 'Update conversation',
    description: 'Update a conversation by id.',
    authentication: 'user',
    requestBodySchema: updateableConversationSchema,
    responseBodySchema: z.object({
      id: z.string(),
    }),
    implementation: async (
      _req: Request,
      params: { conversationId: string },
      { session, requestBody }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity()
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      await updateConversation(params.conversationId, requestBody)
      return { id: params.conversationId }
    },
  }),
  DELETE: operation({
    name: 'Delete conversation',
    description: 'Delete a conversation by id.',
    authentication: 'user',
    responseBodySchema: z.object({ success: z.boolean() }),
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity()
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      await deleteConversation(params.conversationId)
      return { success: true }
    },
  }),
})
