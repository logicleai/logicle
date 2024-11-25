import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export type Conversation = schema.Conversation
export type MessageType = 'assistant' | 'user' | 'tool'
export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export interface ToolCallResult {
  toolCallId: string
  toolName: string
  result: any
}

export interface ToolCallAuthResponse {
  allow: boolean
}

export type BaseMessage = Omit<schema.Message, 'role'> & {
  attachments: Attachment[]
  toolCall?: ToolCall
  toolCallResult?: ToolCallResult
}

export type OtherMessage = BaseMessage & {
  role: MessageType
}

export type DebugMessage = BaseMessage & {
  role: 'tool-debug'
  displayMessage: string
  data: Record<string, string>
}

export type ToolCallAuthRequestMessage = BaseMessage &
  ToolCall & {
    role: 'tool-auth-request'
  }

export type ToolCallAuthResponseMessage = BaseMessage &
  ToolCallAuthResponse & {
    role: 'tool-auth-response'
  }

export type ToolOutputMessage = BaseMessage & {
  role: 'tool-output'
}

export type Message =
  | OtherMessage
  | DebugMessage
  | ToolCallAuthRequestMessage
  | ToolCallAuthResponseMessage
  | ToolOutputMessage

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

interface TextStreamPartAttachment extends TextStreamPartGeneric {
  type: 'attachment'
  content: dto.Attachment
}

interface TextStreamPartNewMessage extends TextStreamPartGeneric {
  type: 'newMessage'
  content: Message
}

interface TextStreamPartToolCallAuthRequest extends TextStreamPartGeneric {
  type: 'toolCallAuthRequest'
  content: ToolCall
}

interface TextStreamPartToolCall extends TextStreamPartGeneric {
  type: 'toolCall'
  content: ToolCall
}

interface TextStreamPartSummary extends TextStreamPartGeneric {
  type: 'summary'
  content: string
}

export type TextStreamPart =
  | TextStreamPartText
  | TextStreamPartAttachment
  | TextStreamPartNewMessage
  | TextStreamPartToolCall
  | TextStreamPartToolCallAuthRequest
  | TextStreamPartSummary
