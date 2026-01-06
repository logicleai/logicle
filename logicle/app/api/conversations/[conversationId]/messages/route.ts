import { getConversation, getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from 'db/database'
import { operation, route } from '@/lib/routes'
import { z } from 'zod'
import { messageSchema } from '@/types/dto/chat'

export const dynamic = 'force-dynamic'

export const { GET, DELETE } = route({
  GET: operation({
    name: 'List messages in conversation',
    description: 'Get messages for a conversation (owned by the session user).',
    authentication: 'user',
    responseBodySchema: messageSchema.array(),
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      const messages = await getConversationMessages(params.conversationId)
      return messages
    },
  }),
  DELETE: operation({
    name: 'Delete messages in conversation',
    description: 'Delete messages by id within a conversation (owned by the session user).',
    authentication: 'user',
    responseBodySchema: z.object({ success: z.boolean() }),
    implementation: async (req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      const url = new URL(req.url)
      const idsToDeleteParam = url.searchParams.get('ids')
      if (!idsToDeleteParam) {
        return ApiResponses.invalidParameter('Missing ids parameter')
      }
      const idsToDelete = idsToDeleteParam.split(',')

      const storedMessageIds = (await getConversationMessages(params.conversationId)).map(
        (m) => m.id
      )
      if (idsToDelete.some((id) => !storedMessageIds.includes(id))) {
        return ApiResponses.invalidParameter(
          `At least one message is not part of the specified conversation`
        )
      }
      await db.deleteFrom('Message').where('Message.id', 'in', idsToDelete).execute()
      return { success: true }
    },
  }),
})
