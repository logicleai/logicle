import { db } from 'db/database'
import { MessageFromMessage } from './utils'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const saveMessage = async (message: dto.Message) => {
  const mapped = {
    ...message,
    sentAt: new Date().toISOString(),
    content: JSON.stringify({
      content: message.content,
      attachments: message.attachments,
      metadata: message.metadata,
    }),
    attachments: undefined,
  } as schema.Message

  try {
    await db.insertInto('Message').values(mapped).execute()
  } catch (error) {
    console.error('Error saving message:', error)
    throw error
  }
}

export const getMessages = async (conversationId: string) => {
  const msgs = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .orderBy('sentAt', 'asc')
    .execute()
  return msgs.map(MessageFromMessage)
}
