export type JsonPrimitive = string | number | boolean | null
export type JSONValue = JsonPrimitive | JSONValue[] | { [key: string]: JSONValue }

export interface Attachment {
  id: string
  mimetype: string
  name: string
  size: number
}

export type Citation =
  | string
  | {
      title: string
      summary: string
      url: string
      favicon?: string
    }

export interface ToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, JSONValue>
}

export interface ToolCallResult {
  toolCallId: string
  toolName: string
  result: JSONValue
}

export interface ToolCallAuthResponse {
  allow: boolean
}

export type BaseMessageV1 = {
  id: string
  content: string
  conversationId: string
  parent: string | null
  sentAt: string
  attachments: Attachment[]
  citations?: Citation[]
}

export type UserMessageV1 = BaseMessageV1 & {
  role: 'user'
}

export type ToolCallMessageV1 = BaseMessageV1 &
  ToolCall & {
    role: 'tool-call'
    reasoning?: string
    reasoning_signature?: string
  }

export type AssistantMessageV1 = BaseMessageV1 & {
  role: 'assistant'
  reasoning?: string
  reasoning_signature?: string
}

export type ToolResultMessageV1 = BaseMessageV1 &
  ToolCallResult & {
    role: 'tool-result'
  }

export type ToolOutputMessageV1 = BaseMessageV1 & {
  role: 'tool-output'
}

export type ErrorMessageV1 = BaseMessageV1 & {
  role: 'error'
}

export type DebugMessageV1 = BaseMessageV1 & {
  role: 'tool-debug'
  displayMessage: string
  data: Record<string, JSONValue>
}

export type ToolCallAuthRequestMessageV1 = BaseMessageV1 &
  ToolCall & {
    role: 'tool-auth-request'
  }

export type ToolCallAuthResponseMessageV1 = BaseMessageV1 &
  ToolCallAuthResponse & {
    role: 'tool-auth-response'
  }

export type MessageV1 =
  | UserMessageV1
  | AssistantMessageV1
  | ToolCallMessageV1
  | ToolOutputMessageV1
  | ToolResultMessageV1
  | ErrorMessageV1
  | DebugMessageV1
  | ToolCallAuthRequestMessageV1
  | ToolCallAuthResponseMessageV1
