import { db } from 'db/database'
import { dtoMessageFromDbMessage } from './utils'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const dtoMessageToDbMessage = (message: dto.Message): schema.Message => {
  const content = JSON.stringify({
    ...message,
    id: undefined,
    conversationId: undefined,
    parent: undefined,
    role: undefined,
    sentAt: undefined,
  })
  const sentAt = new Date().toISOString()
  return {
    content,
    id: message.id,
    conversationId: message.conversationId,
    parent: message.parent,
    role: message.role,
    sentAt,
    version: 4,
  }
}

export const saveMessage = async (message: dto.Message) => {
  const content = JSON.stringify({
    ...message,
    id: undefined,
    conversationId: undefined,
    parent: undefined,
    role: undefined,
    sentAt: undefined,
  })
  const sentAt = new Date().toISOString()
  const mapped = {
    content,
    id: message.id,
    conversationId: message.conversationId,
    parent: message.parent,
    role: message.role,
    sentAt,
    version: 4,
  } as schema.Message
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('Conversation')
      .set('lastMsgSentAt', sentAt)
      .where('id', '=', message.conversationId)
      .execute()
    await trx.insertInto('Message').values(mapped).execute()
  })
  // Fire-and-forget: warms the context-compression cache as soon as the message is durable, so a
  // later prompt build that needs to compact this message doesn't pay for it synchronously. Must
  // never affect message persistence — see "Compression Starts on Save" in
  // docs/context-compression.md.
  void import('@/backend/lib/chat/compression-planner').then(({ warmCompressionCache }) =>
    warmCompressionCache(message)
  )
}

export const getMessages = async (conversationId: string) => {
  const msgs = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .orderBy('sentAt', 'asc')
    .execute()
  return msgs.map(dtoMessageFromDbMessage)
}
