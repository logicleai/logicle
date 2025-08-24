import { getConversation, getLastSentMessage } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import { ConversationSharing } from '@/db/schema'

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

export const GET = requireSession(
  async (session: SimpleSession, _req: Request, params: { conversationId: string }) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return ApiResponses.noSuchEntity(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction()
    }
    const shares = await getConversationSharing(params.conversationId)
    return ApiResponses.json(shares)
  }
)

export const POST = requireSession(
  async (session: SimpleSession, _req: Request, params: { conversationId: string }) => {
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
    return ApiResponses.json(conversationSharing)
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, _req: Request, params: { conversationId: string }) => {
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
  }
)
