import * as schema from '@/db/schema'
import {
  assistantDraftSchema,
  AssistantIdentification,
  assistantIdentificationSchema,
  assistantUsabilitySchema,
  AssistantUsability,
} from './assistant'
import { z } from 'zod'
import { JSONValue } from 'ai'

export const conversationSchema = z.object({
  assistantId: z.string(),
  id: z.string(),
  name: z.string(),
  ownerId: z.string(),
  createdAt: z.string().datetime(),
  lastMsgSentAt: z.string().datetime().nullable(),
})

export type Conversation = z.infer<typeof conversationSchema>

export const insertableConversationSchema = conversationSchema.omit({
  id: true,
  createdAt: true,
  lastMsgSentAt: true,
  ownerId: true,
})

export type InsertableConversation = z.infer<typeof insertableConversationSchema>

export const updateableConversationSchema = insertableConversationSchema
  .omit({
    assistantId: true,
  })
  .partial()

export type UpdateableConversation = z.infer<typeof updateableConversationSchema>

export const conversationFragmentSchema = z.object({
  id: z.string(),
  lastMessageId: z.string(),
})

export type ConversationFragment = z.infer<typeof conversationFragmentSchema>

export type ConversationSharing = ConversationFragment

export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export const ConversationWithFolderIdSchema = conversationSchema.extend({
  folderId: z.string().nullable(),
})

export type ConversationWithFolderId = z.infer<typeof ConversationWithFolderIdSchema>

export const ConversationWithFolderSchema = ConversationWithFolderIdSchema.extend({
  assistant: assistantIdentificationSchema,
})

export const ConversationWithMessagesSchema = z.object({
  conversation: ConversationWithFolderIdSchema,
  messages: z.array(z.record(z.string(), z.unknown())) as unknown as z.ZodType<Message[]>,
})

export type ConversationWithFolder = z.infer<typeof ConversationWithFolderSchema>

export type ConversationWithMessages = z.infer<typeof ConversationWithMessagesSchema>

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export type ToolCallResultOutput =
  | {
      type: 'text'
      value: string
    }
  | {
      type: 'json'
      value: JSONValue
    }
  | {
      type: 'error-text'
      value: string
    }
  | {
      type: 'error-json'
      value: JSONValue
    }
  | {
      type: 'content'
      value: Array<
        | {
            type: 'text'
            text: string
          }
        | {
            type: 'file'
            id: string
            mimetype: string
            name: string
            size: number
          }
      >
    }

export interface ToolCallResult {
  toolCallId: string
  toolName: string
  result: ToolCallResultOutput
}

export type UserResponse = {
  allow: boolean
}

export type McpOAuthPendingAction = {
  toolCall: ToolCall
  result?: ToolCallResultOutput
}

export type McpOAuthUserRequest = {
  type: 'mcp-oauth'
  toolId: string
  toolName: string
  authorizationUrl: string
  topLevelNavigation: boolean
  status: 'missing' | 'expired' | 'unreadable'
  message?: string
  pendingAction?: McpOAuthPendingAction
}

export type ToolCallAuthorizationRequest = ToolCall & {
  type: 'tool-call-authorization'
  message?: string
}

export type UserRequest = McpOAuthUserRequest | ToolCallAuthorizationRequest

export type BaseMessage = Omit<schema.Message, 'role' | 'content' | 'version'> & {
  citations?: Citation[]
}

export type UserMessage = BaseMessage & {
  content: string
  role: 'user'
  attachments: Attachment[]
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

export type BuiltinToolCallPart = ToolCall & { type: 'builtin-tool-call' }

export type BuiltinToolCallResultPart = ToolCallResult & { type: 'builtin-tool-result' }

export type ErrorPart = {
  type: 'error'
  error: string
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | BuiltinToolCallPart
  | BuiltinToolCallResultPart
  | ToolCallPart
  | ToolCallResultPart
  | ErrorPart
  | DebugPart

export type AssistantMessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | BuiltinToolCallPart
  | BuiltinToolCallResultPart
  | ErrorPart
  | DebugPart

export type AssistantMessage = BaseMessage & {
  role: 'assistant'
  parts: AssistantMessagePart[]
}

export type UserRequestMessage = BaseMessage & {
  role: 'user-request'
  request: UserRequest
}

export type UserResponseMessage = BaseMessage &
  UserResponse & {
    role: 'user-response'
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
  | UserRequestMessage
  | UserResponseMessage
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
  part: MessagePart
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
  attachment: Attachment
}

interface TextStreamPartCitations extends TextStreamPartGeneric {
  type: 'citations'
  citations: Citation[]
}

interface TextStreamPartUserRequest extends TextStreamPartGeneric {
  type: 'user-request'
  request: UserRequestMessage
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
  | TextStreamPartUserRequest
  | TextStreamPartSummary

export const messageSchema = z.record(z.string(), z.unknown()) as unknown as z.ZodType<Message>

export const sharedConversationSchema = z.object({
  title: z.string(),
  assistant: assistantIdentificationSchema,
  assistantUsability: assistantUsabilitySchema.optional(),
  messages: messageSchema.array(),
})
export type SharedConversation = {
  title: string
  assistant: AssistantIdentification
  assistantUsability?: AssistantUsability
  messages: Message[]
}

export const evaluateAssistantRequestSchema = z.object({
  assistant: assistantDraftSchema,
  messages: z.array(z.any()) as z.ZodType<Message[]>,
})

export type EvaluateAssistantRequest = z.infer<typeof evaluateAssistantRequestSchema>
