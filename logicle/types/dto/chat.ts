import * as schema from '@/db/schema'

export type Conversation = schema.Conversation
export type Role = 'assistant' | 'user' | 'function'
export type Message = schema.Message
export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export type MessageDTO = Message & { attachments: Attachment[] }
export type InsertableMessageDTO = Omit<MessageDTO, 'id'>
export type ConversationWithMessages = Conversation & { messages: MessageDTO[] }
export type ConversationWithFolder = Conversation & { folderId: string } & {
  lastMsgSentAt: string
}
