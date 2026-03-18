import { JSONValue } from '@ai-sdk/provider'

export type LitellmChatPrompt = Array<LitellmMessage>

export type LitellmMessage =
  | LitellmSystemMessage
  | LitellmUserMessage
  | LitellmAssistantMessage
  | LitellmToolMessage

// Allow for arbitrary additional properties for general purpose
// provider-metadata-specific extensibility.
type JsonRecord<T = never> = Record<string, JSONValue | JSONValue[] | T | T[] | undefined>

export interface LitellmSystemMessage extends JsonRecord {
  role: 'system'
  content: string
}

export interface LitellmUserMessage extends JsonRecord<LitellmContentPart> {
  role: 'user'
  content: string | Array<LitellmContentPart>
}

export type LitellmContentPart = LitellmContentPartText | LitellmContentPartImage

export interface LitellmContentPartImage extends JsonRecord {
  type: 'image_url'
  image_url: { url: string }
}

export interface LitellmContentPartText extends JsonRecord {
  type: 'text'
  text: string
}

export interface LitellmAssistantMessage extends JsonRecord<LitellmMessageToolCall> {
  role: 'assistant'
  content?: string | null
  tool_calls?: Array<LitellmMessageToolCall>
}

export interface LitellmMessageToolCall extends JsonRecord {
  type: 'function'
  id: string
  function: {
    arguments: string
    name: string
  }
}

export interface LitellmToolMessage extends JsonRecord {
  role: 'tool'
  content: string
  tool_call_id: string
}
