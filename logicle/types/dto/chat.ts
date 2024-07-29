import * as schema from '@/db/schema'

export type Conversation = schema.Conversation
export type MessageType = 'assistant' | 'user'
export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export type Message = schema.Message & {
  role: MessageType
  attachments: Attachment[]
  confirmRequest?: {
    toolName: string
    toolArgs: any
  }
  confirmResponse?: any
}
export type InsertableMessage = Omit<Message, 'id'>
export type ConversationWithMessages = Conversation & { messages: Message[] }
export type ConversationWithFolder = Conversation & { folderId: string } & {
  lastMsgSentAt: string
}
