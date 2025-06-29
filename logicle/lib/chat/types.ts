import * as dto from '@/types/dto'

// MessageWithError is a dto.Message enriched with an error which may be added
// when fetching
export type MessageWithError = dto.Message & { error?: string }

export type ConversationWithMessages = dto.Conversation & {
  messages: MessageWithError[]
  targetLeaf?: string
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

export interface IUserMessageGroup {
  actor: 'user'
  message: dto.UserMessage & { error?: string }
  siblings: string[]
}

export interface IAssistantMessageGroup {
  actor: 'assistant'
  messages: MessageWithErrorExt[]
  siblings: string[]
}

export type IMessageGroup = IUserMessageGroup | IAssistantMessageGroup
