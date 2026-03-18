import { JSONValue } from 'ai'

export interface AttachmentV3 {
  id: string
  mimetype: string
  name: string
  size: number
}

export interface ToolCallV3 {
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export type ToolCallResultOutputV3 =
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

export interface ToolCallResultV3 {
  toolCallId: string
  toolName: string
  result: ToolCallResultOutputV3
}

export interface ToolCallAuthResponseV3 {
  allow: boolean
}

export type BaseMessageV3 = {
  id: string
  conversationId: string
  parent: string | null
  sentAt: string
  attachments: AttachmentV3[]
  citations?: CitationV3[]
}

export type UserMessageV3 = BaseMessageV3 & {
  content: string
  role: 'user'
}

export interface TextPartV3 {
  type: 'text'
  text: string
}

export interface ReasoningPartV3 {
  type: 'reasoning'
  reasoning: string
  reasoning_signature?: string
}

export type ToolCallPartV3 = ToolCallV3 & { type: 'tool-call' }

export type ToolCallResultPartV3 = ToolCallResultV3 & { type: 'tool-result' }

export type BuiltinToolCallPartV3 = ToolCallV3 & { type: 'builtin-tool-call' }

export type BuiltinToolCallResultPartV3 = ToolCallResultV3 & { type: 'builtin-tool-result' }

export type ErrorPartV3 = {
  type: 'error'
  error: string
}

export interface DebugPartV3 {
  type: 'debug'
  displayMessage: string
  data: Record<string, unknown>
}

export type MessagePartV3 =
  | TextPartV3
  | ReasoningPartV3
  | BuiltinToolCallPartV3
  | BuiltinToolCallResultPartV3
  | ToolCallPartV3
  | ToolCallResultPartV3
  | ErrorPartV3
  | DebugPartV3

export type AssistantMessagePartV3 =
  | TextPartV3
  | ReasoningPartV3
  | ToolCallPartV3
  | BuiltinToolCallPartV3
  | BuiltinToolCallResultPartV3
  | ErrorPartV3
  | DebugPartV3

export type AssistantMessageV3 = BaseMessageV3 & {
  role: 'assistant'
  parts: AssistantMessagePartV3[]
}

export type ToolCallAuthRequestMessageV3 = BaseMessageV3 &
  ToolCallV3 & {
    role: 'tool-auth-request'
  }

export type ToolCallAuthResponseMessageV3 = BaseMessageV3 &
  ToolCallAuthResponseV3 & {
    role: 'tool-auth-response'
  }

type ToolMessagePartV3 = DebugPartV3 | ToolCallResultPartV3

export type ToolMessageV3 = BaseMessageV3 & {
  role: 'tool'
  parts: ToolMessagePartV3[]
}

export type MessageV3 =
  | UserMessageV3
  | AssistantMessageV3
  | ToolCallAuthRequestMessageV3
  | ToolCallAuthResponseMessageV3
  | ToolMessageV3

export type CitationV3 =
  | string
  | {
      title: string
      summary: string
      url: string
      favicon?: string
    }

export interface TextStreamPartGenericV3 {
  type: string
}

export interface TextStreamPartNewMessageV3 extends TextStreamPartGenericV3 {
  type: 'message'
  msg: MessageV3
}

export interface TextStreamPartNewPartV3 extends TextStreamPartGenericV3 {
  type: 'part'
  part: MessagePartV3
}

export interface TextStreamPartTextV3 extends TextStreamPartGenericV3 {
  type: 'text'
  text: string
}

export interface TextStreamPartReasoningV3 extends TextStreamPartGenericV3 {
  type: 'reasoning'
  reasoning: string
}

export interface TextStreamPartAttachmentV3 extends TextStreamPartGenericV3 {
  type: 'attachment'
  attachment: AttachmentV3
}

export interface TextStreamPartCitationsV3 extends TextStreamPartGenericV3 {
  type: 'citations'
  citations: CitationV3[]
}

export interface TextStreamPartToolCallAuthRequestV3 extends TextStreamPartGenericV3 {
  type: 'tool-auth-request'
  toolCall: ToolCallV3
}

export interface TextStreamPartSummaryV3 extends TextStreamPartGenericV3 {
  type: 'summary'
  summary: string
}

export type TextStreamPartV3 =
  | TextStreamPartNewMessageV3
  | TextStreamPartNewPartV3
  | TextStreamPartTextV3
  | TextStreamPartReasoningV3
  | TextStreamPartAttachmentV3
  | TextStreamPartCitationsV3
  | TextStreamPartToolCallAuthRequestV3
  | TextStreamPartSummaryV3
