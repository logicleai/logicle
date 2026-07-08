import { db } from 'db/database'
import { dtoMessageFromDbMessage } from './utils'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const dtoMessageToDbMessage = (message: dto.Message): schema.Message => {
  const sentAt = message.sentAt ?? new Date().toISOString()
  message.sentAt = sentAt
  const content = JSON.stringify({
    ...message,
    id: undefined,
    conversationId: undefined,
    parent: undefined,
    role: undefined,
    sentAt: undefined,
  })
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
  const sentAt = message.sentAt ?? new Date().toISOString()
  message.sentAt = sentAt
  const content = JSON.stringify({
    ...message,
    id: undefined,
    conversationId: undefined,
    parent: undefined,
    role: undefined,
    sentAt: undefined,
  })
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
