import * as schema from '@/db/schema'

export type Conversation = schema.Conversation
export type MessageType = 'assistant' | 'user'
export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export interface ConfirmRequest {
  toolCallId: string
  toolName: string
  toolArgs: any
}

export interface ConfirmResponse {
  allow: boolean
}

export type Message = schema.Message & {
  role: MessageType
  attachments: Attachment[]
  confirmRequest?: ConfirmRequest
  confirmResponse?: ConfirmResponse
}
export type InsertableMessage = Omit<Message, 'id'>
export type ConversationWithMessages = Conversation & { messages: Message[] }
export type ConversationWithFolder = Conversation & { folderId: string } & {
  lastMsgSentAt: string
}

/**
 * This is the payload of chat API
 */
interface TextStreamPartGeneric {
  type: string
}

interface TextStreamPartText extends TextStreamPartGeneric {
  type: 'delta'
  content: string
}

interface TextStreamPartResponse extends TextStreamPartGeneric {
  type: 'response'
  content: Message
}

interface TextStreamPartConfirmRequest extends TextStreamPartGeneric {
  type: 'confirmRequest'
  content: ConfirmRequest
}

interface TextStreamPartSummary extends TextStreamPartGeneric {
  type: 'summary'
  content: string
}

export type TextStreamPart =
  | TextStreamPartText
  | TextStreamPartResponse
  | TextStreamPartConfirmRequest
  | TextStreamPartSummary
