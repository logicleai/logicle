import { Conversation } from '@/types/db'
import { Message } from '@/types/db'

export type Role = 'assistant' | 'user' | 'function'

export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export type MessageDTO = Message & { attachments: Attachment[] }
export type InsertableMessageDTO = Omit<MessageDTO, 'id'>
export type ConversationWithMessages = Conversation & { messages: MessageDTO[] }
export type ConversationWithFolder = Conversation & { folderId: string } & { lastMsgSentAt: string }

export interface UserAssistant {
  id: string
  name: string
  description: string
  icon?: string | null
  pinned: boolean
  lastUsed: string | null
}
