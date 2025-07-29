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
  citations?: dto.Citation[]
}

export type UserMessage = BaseMessage & {
  role: 'user'
}

export interface TextPart {
  type: 'text'
  text: string
}

export interface ReasoningPart {
  type: 'reasoning'
  reasoning: string
  reasoning_signature?: string
}

export type ToolCallPart = ToolCall & { type: 'tool-call' }
export type ToolCallResultPart = ToolCallResult & { type: 'tool-result' }
export type AssistantMessagePart = TextPart | ReasoningPart | ToolCallPart | ToolCallResultPart

export type AssistantMessage = BaseMessage & {
  role: 'assistant'
  parts: AssistantMessagePart[]
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

interface TextStreamPartTextStart extends TextStreamPartGeneric {
  type: 'text-start'
}

interface TextStreamPartText extends TextStreamPartGeneric {
  type: 'delta'
  text: string
}

interface TextStreamPartReasoning extends TextStreamPartGeneric {
  type: 'reasoning'
  reasoning: string
}

interface TextStreamPartReasoningStart extends TextStreamPartGeneric {
  type: 'reasoning-start'
}

interface TextStreamPartAttachment extends TextStreamPartGeneric {
  type: 'attachment'
  attachment: dto.Attachment
}

interface TextStreamPartCitations extends TextStreamPartGeneric {
  type: 'citations'
  citations: Citation[]
}

interface TextStreamPartNewMessage extends TextStreamPartGeneric {
  type: 'newMessage'
  msg: Message
}

interface TextStreamPartToolCallAuthRequest extends TextStreamPartGeneric {
  type: 'tool-auth-request'
  toolCall: ToolCall
}

interface TextStreamPartToolCall extends TextStreamPartGeneric, ToolCall {
  type: 'tool-call'
}

interface TextStreamPartToolCallResult extends TextStreamPartGeneric {
  type: 'tool-call-result'
  toolCallResult: ToolCallResult
}

interface TextStreamPartSummary extends TextStreamPartGeneric {
  type: 'summary'
  summary: string
}

export type TextStreamPart =
  | TextStreamPartTextStart
  | TextStreamPartText
  | TextStreamPartReasoningStart
  | TextStreamPartReasoning
  | TextStreamPartAttachment
  | TextStreamPartCitations
  | TextStreamPartNewMessage
  | TextStreamPartToolCall
  | TextStreamPartToolCallResult
  | TextStreamPartToolCallAuthRequest
  | TextStreamPartSummary
