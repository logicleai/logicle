import { db } from '@/db/database'
import { error, forbidden, noBody, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
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
    responses: [responseSpec(200, conversationFragmentSchema.array()), responseSpec(403), responseSpec(404), responseSpec(500)] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      return ok(await getConversationSharing(params.conversationId))
    },
  }),
  POST: operation({
    name: 'Create conversation share',
    description: 'Create a share link for a conversation.',
    authentication: 'user',
    responses: [responseSpec(200, conversationFragmentSchema), responseSpec(403), responseSpec(404), responseSpec(500)] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const id = nanoid()
      const message = await getLastSentMessage(params.conversationId)
      if (!message) {
        return error(500, 'no messages')
      }
      const conversationSharing: ConversationSharing = {
        id,
        lastMessageId: message.id,
      }
      await db.insertInto('ConversationSharing').values(conversationSharing).execute()
      return ok(conversationSharing)
    },
  }),
  PATCH: operation({
    name: 'Update conversation share last message',
    description: 'Update share links to point to latest message.',
    authentication: 'user',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404), responseSpec(500)] as const,
    implementation: async (_req: Request, params: { conversationId: string }, { session }) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }

      const lastSentMessage = await getLastSentMessage(params.conversationId)
      if (!lastSentMessage) {
        return error(500, 'no messages')
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
      return noBody()
    },
  }),
})
