import { JSONValue } from '@ai-sdk/provider'

export type LiteLlmChatPrompt = Array<LiteLlmMessage>

export type LiteLlmMessage =
  | LiteLlmSystemMessage
  | LiteLlmUserMessage
  | LiteLlmAssistantMessage
  | LiteLlmToolMessage

// Allow for arbitrary additional properties for general purpose
// provider-metadata-specific extensibility.
type JsonRecord<T = never> = Record<string, JSONValue | JSONValue[] | T | T[] | undefined>

export interface LiteLlmSystemMessage extends JsonRecord {
  role: 'system'
  content: string
}

export interface LiteLlmUserMessage extends JsonRecord<LiteLlmContentPart> {
  role: 'user'
  content: string | Array<LiteLlmContentPart>
}

export type LiteLlmContentPart = LiteLlmContentPartText | LiteLlmContentPartImage

export interface LiteLlmContentPartImage extends JsonRecord {
  type: 'image_url'
  image_url: { url: string }
}

export interface LiteLlmContentPartText extends JsonRecord {
  type: 'text'
  text: string
}

export interface LiteLlmAssistantMessage extends JsonRecord<LiteLlmMessageToolCall> {
  role: 'assistant'
  content?: string | null
  tool_calls?: Array<LiteLlmMessageToolCall>
}

export interface LiteLlmMessageToolCall extends JsonRecord {
  type: 'function'
  id: string
  function: {
    arguments: string
    name: string
  }
}

export interface LiteLlmToolMessage extends JsonRecord {
  role: 'tool'
  content: string
  tool_call_id: string
}
