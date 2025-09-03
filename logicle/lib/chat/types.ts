import * as dto from '@/types/dto'

// MessageWithError is a dto.Message enriched with an error which may be added
// when fetching
export type MessageWithError = dto.Message & { error?: string }

export type ConversationWithMessages = dto.Conversation & {
  messages: MessageWithError[]
  targetLeaf?: string
}

export type UIToolCallPart = dto.ToolCallPart & {
  status: 'completed' | 'need-auth' | 'running'
  result?: dto.ToolCallResult
}

export type UIReasoningPart = dto.ReasoningPart & {
  running: boolean
}

export type UITextPart = dto.TextPart & {
  running: boolean
}

export type UIAssistantMessagePart =
  | UIReasoningPart
  | UITextPart
  | dto.ErrorPart
  | dto.DebugPart
  | UIToolCallPart
  | dto.BuiltinToolCallResultPart

export type UIAssistantMessage = Omit<dto.AssistantMessage, 'parts'> & {
  parts: UIAssistantMessagePart[]
}

export type UIMessage = (
  | dto.UserMessage
  | UIAssistantMessage
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
  messages: UIMessage[]
  siblings: string[]
}

export type IMessageGroup = IUserMessageGroup | IAssistantMessageGroup
