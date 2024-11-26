import { db } from 'db/database'
import { dtoMessageFromDbMessage } from './utils'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const saveMessage = async (message: dto.Message) => {
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
    sentAt: new Date().toISOString(),
  } as schema.Message
  await db.insertInto('Message').values(mapped).execute()
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
