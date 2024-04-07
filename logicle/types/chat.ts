import * as dto from '@/types/dto'

export type Role = 'assistant' | 'user' | 'function'

export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export type MessageDTO = dto.Message & { attachments: Attachment[] }
export type InsertableMessageDTO = Omit<MessageDTO, 'id'>
export type ConversationWithMessages = dto.Conversation & { messages: MessageDTO[] }
export type ConversationWithFolder = dto.Conversation & { folderId: string } & {
  lastMsgSentAt: string
}

export interface UserAssistant {
  id: string
  name: string
  description: string
  icon?: string | null
  pinned: boolean
  lastUsed: string | null
  owner: string
  sharing: dto.Sharing[]
}
