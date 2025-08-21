import * as dto from '@/types/dto'

// MessageWithError is a dto.Message enriched with an error which may be added
// when fetching
export type MessageWithError = dto.Message & { error?: string }

export type ConversationWithMessages = dto.Conversation & {
  messages: MessageWithError[]
  targetLeaf?: string
}

export type ToolCallPartEx = dto.ToolCallPart & {
  status: 'completed' | 'need-auth' | 'running'
  result?: dto.ToolCallResult
}

export type AssistantMessagePartEx =
  | dto.ReasoningPart
  | dto.TextPart
  | dto.ErrorPart
  | dto.DebugPart
  | ToolCallPartEx
  | dto.ToolCallResultPart

export type AssistantMessageEx = Omit<dto.AssistantMessage, 'parts'> & {
  parts: AssistantMessagePartEx[]
}

export type MessageWithErrorExt = (
  | dto.UserMessage
  | AssistantMessageEx
  | dto.ToolCallAuthRequestMessage
  | dto.ToolCallAuthResponseMessage
  | dto.ToolMessage
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
