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

export type SharedConversation = {
  title: string
  assistant: dto.AssistantIdentification
  messages: dto.Message[]
}

export type ConversationWithMessages = {
  conversation: Conversation
  messages: dto.Message[]
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
  reasoning?: string
  reasoning_signature?: string
  citations?: dto.Citation[]
}

export type UserMessage = BaseMessage & {
  role: 'user'
}

export type AssistantMessage = BaseMessage & {
  role: 'assistant'
}

export type ErrorMessage = BaseMessage & {
  role: 'error'
}

export type DebugMessage = BaseMessage & {
  role: 'tool-debug'
  displayMessage: string
  data: Record<string, unknown>
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

export type ToolCallMessage = BaseMessage &
  ToolCall & {
    role: 'tool-call'
  }

export type ToolResultMessage = BaseMessage &
  ToolCallResult & {
    role: 'tool-result'
  }

export type Message =
  | UserMessage
  | AssistantMessage
  | ErrorMessage
  | DebugMessage
  | ToolCallAuthRequestMessage
  | ToolCallAuthResponseMessage
  | ToolOutputMessage
  | ToolCallMessage
  | ToolResultMessage

export type Citation =
  | string
  | {
      title: string
      summary: string
      url: string
      favicon?: string
    }
export type InsertableMessage = Omit<Message, 'id'>
export type ConversationWithFolder = Conversation & {
  folderId: string
  assistant: dto.AssistantIdentification
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

interface TextStreamPartReasoning extends TextStreamPartGeneric {
  type: 'reasoning'
  content: string
}

interface TextStreamPartAttachment extends TextStreamPartGeneric {
  type: 'attachment'
  content: dto.Attachment
}

interface TextStreamPartCitations extends TextStreamPartGeneric {
  type: 'citations'
  content: Citation[]
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
  | TextStreamPartReasoning
  | TextStreamPartAttachment
  | TextStreamPartCitations
  | TextStreamPartNewMessage
  | TextStreamPartToolCall
  | TextStreamPartToolCallAuthRequest
  | TextStreamPartSummary
