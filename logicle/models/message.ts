import { db } from 'db/database'
import { dtoMessageFromDbMessage } from './utils'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export const saveMessage = async (message: dto.Message) => {
  const mapped = {
    id: message.id,
    content: JSON.stringify({
      content: message.content,
      attachments: message.attachments,
      toolCallAuthRequest: message.toolCallAuthRequest,
      toolCallAuthResponse: message.toolCallAuthResponse,
      toolCall: message.toolCall,
      toolCallResult: message.toolCallResult,
      toolOutput: message.toolOutput,
    }),
    conversationId: message.conversationId,
    parent: message.parent,
    role: message.role,
    sentAt: new Date().toISOString(),
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
  return msgs.map(dtoMessageFromDbMessage)
}
