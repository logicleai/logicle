import * as dto from '@/types/dto'

// MessageWithError is a dto.Message enriched with an error which may be added
// when fetching
export type MessageWithError = dto.Message & { error?: string }

export type ConversationWithMessages = dto.Conversation & { messages: MessageWithError[] }

export type MessageWithErrorAndChildren = MessageWithError & {
  children: MessageWithErrorAndChildren[]
}

export type ToolCallMessageEx = dto.ToolCallMessage & {
  status: 'completed' | 'need-auth' | 'running'
  result?: dto.ToolCallResult
}

export type MessageWithErrorExt = (
  | dto.UserMessage
  | dto.AssistantMessage
  | dto.ErrorMessage
  | dto.DebugMessage
  | dto.ToolCallAuthRequestMessage
  | dto.ToolCallAuthResponseMessage
  | dto.ToolOutputMessage
  | ToolCallMessageEx
  | dto.ToolResultMessage
) & { error?: string }

export interface MessageGroup {
  actor: 'user' | 'assistant'
  messages: MessageWithErrorExt[]
}
