import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export type Conversation = schema.Conversation
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

export type BaseMessage = Omit<schema.Message, 'role' | 'content'> & {
  attachments: Attachment[]
  citations?: dto.Citation[]
}

export type UserMessage = BaseMessage & {
  content: string
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

export type ErrorPart = {
  type: 'error'
  error: string
}

export type AssistantMessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | ToolCallResultPart
  | ErrorPart
  | DebugPart

export type AssistantMessage = BaseMessage & {
  role: 'assistant'
  parts: AssistantMessagePart[]
}

export type ToolCallAuthRequestMessage = BaseMessage &
  ToolCall & {
    role: 'tool-auth-request'
  }

export type ToolCallAuthResponseMessage = BaseMessage &
  ToolCallAuthResponse & {
    role: 'tool-auth-response'
  }

export interface DebugPart {
  type: 'debug'
  displayMessage: string
  data: Record<string, unknown>
}

type ToolMessagePart = DebugPart | ToolCallResultPart

export type ToolMessage = BaseMessage & {
  role: 'tool'
  parts: ToolMessagePart[]
}

export type Message =
  | UserMessage
  | AssistantMessage
  | ToolCallAuthRequestMessage
  | ToolCallAuthResponseMessage
  | ToolMessage

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

interface TextStreamPartNewMessage extends TextStreamPartGeneric {
  type: 'message'
  msg: Message
}

interface TextStreamPartNewPart extends TextStreamPartGeneric {
  type: 'part'
  part: dto.AssistantMessagePart
}

interface TextStreamPartText extends TextStreamPartGeneric {
  type: 'text'
  text: string
}

interface TextStreamPartReasoning extends TextStreamPartGeneric {
  type: 'reasoning'
  reasoning: string
}

interface TextStreamPartAttachment extends TextStreamPartGeneric {
  type: 'attachment'
  attachment: dto.Attachment
}

interface TextStreamPartCitations extends TextStreamPartGeneric {
  type: 'citations'
  citations: Citation[]
}

interface TextStreamPartToolCallAuthRequest extends TextStreamPartGeneric {
  type: 'tool-auth-request'
  toolCall: ToolCall
}

interface TextStreamPartSummary extends TextStreamPartGeneric {
  type: 'summary'
  summary: string
}

export type TextStreamPart =
  | TextStreamPartNewMessage
  | TextStreamPartNewPart
  | TextStreamPartText
  | TextStreamPartReasoning
  | TextStreamPartAttachment
  | TextStreamPartCitations
  | TextStreamPartToolCallAuthRequest
  | TextStreamPartSummary
