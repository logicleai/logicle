import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

export type BaseMessageV1 = Omit<schema.Message, 'role'> & {
  attachments: dto.Attachment[]
  citations?: dto.Citation[]
}

export type ToolCallMessageV1 = BaseMessageV1 &
  dto.ToolCall & {
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
  dto.ToolCallResult & {
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
  data: Record<string, unknown>
}

export type MessageV1 =
  | dto.UserMessage
  | AssistantMessageV1
  | ToolCallMessageV1
  | ToolOutputMessageV1
  | ToolResultMessageV1
  | ErrorMessageV1
  | DebugMessageV1
  | dto.ToolCallAuthRequestMessage
  | dto.ToolCallAuthResponseMessage
