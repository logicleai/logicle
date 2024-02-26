import { MessageDTO } from '@/types/chat'
import { InsertableMessage } from '@/types/dto'
import { db } from 'db/database'
import { messageDtoFromMessage } from './utils'

export const saveMessage = async (message: MessageDTO) => {
  const mapped = {
    ...message,
    sentAt: new Date().toISOString(),
    content: JSON.stringify({ content: message.content, attachments: message.attachments }),
    attachments: undefined,
  } as InsertableMessage

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
