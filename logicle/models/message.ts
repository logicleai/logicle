import { MessageDTO } from '@/types/chat'
import { db } from 'db/database'
import { messageDtoFromMessage } from './utils'
import * as schema from '@/db/schema'

export const saveMessage = async (message: MessageDTO) => {
  const mapped = {
    ...message,
    sentAt: new Date().toISOString(),
    content: JSON.stringify({ content: message.content, attachments: message.attachments }),
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
  return msgs.map(messageDtoFromMessage)
}
