export type JsonPrimitiveV2 = string | number | boolean | null
export type JSONValueV2 = JsonPrimitiveV2 | JSONValueV2[] | { [key: string]: JSONValueV2 }

export interface AttachmentV2 {
  id: string
  mimetype: string
  name: string
  size: number
}

export type CitationV2 =
  | string
  | {
      title: string
      summary: string
      url: string
      favicon?: string
    }

export interface ToolCallV2 {
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export type LanguageModelV2ToolResultOutputV2 =
  | { type: 'json'; value: JSONValueV2 }
  | {
      type: 'text'
      value: string
    }
  | { type: 'content'; value: ToolResultContentPartV2[] }
  | { type: 'error-text'; value: string }

export type ToolResultContentPartV2 =
  | { type: 'text'; text: string }
  | { type: 'image-data'; data: string; mediaType: string }
  | { type: 'file-data'; data: string; mediaType: string }

export interface ToolCallResultV2 {
  toolCallId: string
  toolName: string
  result: LanguageModelV2ToolResultOutputV2 | unknown
}

export interface ToolCallAuthResponseV2 {
  allow: boolean
}

export type BaseMessageV2 = {
  id: string
  conversationId: string
  parent: string | null
  sentAt: string
  attachments: AttachmentV2[]
  citations?: CitationV2[]
}

export type UserMessageV2 = BaseMessageV2 & {
  content: string
  role: 'user'
}

export interface TextPartV2 {
  type: 'text'
  text: string
}

export interface ReasoningPartV2 {
  type: 'reasoning'
  reasoning: string
  reasoning_signature?: string
}

export type ToolCallPartV2 = ToolCallV2 & { type: 'tool-call' }

export type ToolCallResultPartV2 = ToolCallResultV2 & { type: 'tool-result' }

export type BuiltinToolCallPartV2 = ToolCallV2 & { type: 'builtin-tool-call' }

export type BuiltinToolCallResultPartV2 = ToolCallResultV2 & { type: 'builtin-tool-result' }

export type ErrorPartV2 = {
  type: 'error'
  error: string
}

export type MessagePartV2 =
  | TextPartV2
  | ReasoningPartV2
  | BuiltinToolCallPartV2
  | BuiltinToolCallResultPartV2
  | ToolCallPartV2
  | ToolCallResultPartV2
  | ErrorPartV2
  | DebugPartV2

export type AssistantMessagePartV2 =
  | TextPartV2
  | ReasoningPartV2
  | ToolCallPartV2
  | BuiltinToolCallPartV2
  | BuiltinToolCallResultPartV2
  | ErrorPartV2
  | DebugPartV2

export type AssistantMessageV2 = BaseMessageV2 & {
  role: 'assistant'
  parts: AssistantMessagePartV2[]
}

export type ToolCallAuthRequestMessageV2 = BaseMessageV2 &
  ToolCallV2 & {
    role: 'tool-auth-request'
  }

export type ToolCallAuthResponseMessageV2 = BaseMessageV2 &
  ToolCallAuthResponseV2 & {
    role: 'tool-auth-response'
  }

export interface DebugPartV2 {
  type: 'debug'
  displayMessage: string
  data: Record<string, unknown>
}

type ToolMessagePartV2 = DebugPartV2 | ToolCallResultPartV2

export type ToolMessageV2 = BaseMessageV2 & {
  role: 'tool'
  parts: ToolMessagePartV2[]
}

export type MessageV2 =
  | UserMessageV2
  | AssistantMessageV2
  | ToolCallAuthRequestMessageV2
  | ToolCallAuthResponseMessageV2
  | ToolMessageV2
