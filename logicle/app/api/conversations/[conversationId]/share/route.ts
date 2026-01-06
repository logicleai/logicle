import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { getConversation, getLastSentMessage } from '@/models/conversation'
import { nanoid } from 'nanoid'
import { conversationFragmentSchema, ConversationSharing } from '@/types/dto'

export const dynamic = 'force-dynamic'

async function getConversationSharing(conversationId: string) {
  return await db
    .selectFrom('ConversationSharing')
    .innerJoin('Message', (join) =>
      join.onRef('Message.id', '=', 'ConversationSharing.lastMessageId')
    )
    .where('Message.conversationId', '=', conversationId)
    .selectAll('ConversationSharing')
    .execute()
}

export const { GET, POST, PATCH } = route({
  GET: operation({
    name: 'List conversation shares',
    description: 'List share links for a conversation.',
    authentication: 'user',
    responseBodySchema: conversationFragmentSchema.array(),
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      return await getConversationSharing(params.conversationId)
    },
  }),
  POST: operation({
    name: 'Create conversation share',
    description: 'Create a share link for a conversation.',
    authentication: 'user',
    responseBodySchema: conversationFragmentSchema,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      const id = nanoid()
      const message = await getLastSentMessage(params.conversationId)
      if (!message) {
        return ApiResponses.internalServerError('no messages')
      }
      const conversationSharing: ConversationSharing = {
        id,
        lastMessageId: message.id,
      }
      await db.insertInto('ConversationSharing').values(conversationSharing).execute()
      return conversationSharing
    },
  }),
  PATCH: operation({
    name: 'Update conversation share last message',
    description: 'Update share links to point to latest message.',
    authentication: 'user',
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }

      const lastSentMessage = await getLastSentMessage(params.conversationId)
      if (!lastSentMessage) {
        return ApiResponses.internalServerError('no messages')
      }
      const shares = await getConversationSharing(params.conversationId)
      await db
        .updateTable('ConversationSharing')
        .set('lastMessageId', lastSentMessage.id)
        .where(
          'ConversationSharing.id',
          'in',
          shares.map((s) => s.id)
        )
        .execute()
      return ApiResponses.success()
    },
  }),
})
