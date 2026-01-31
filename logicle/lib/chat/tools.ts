import * as dto from '@/types/dto'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'
import { JSONSchema7 } from 'json-schema'
import { LlmModel } from './models'
import * as ai from 'ai'

export interface ToolUILink {
  debugMessage: (displayMessage: string, data: Record<string, unknown>) => void
  addCitations: (citations: dto.Citation[]) => void
  attachments: dto.Attachment[]
  citations: dto.Citation[]
}

export interface ToolInvokeParams {
  llmModel: LlmModel
  messages: dto.Message[]
  assistantId: string
  userId?: string
  toolCallId?: string
  toolName?: string
  params: Record<string, unknown>
  uiLink: ToolUILink
  debug?: boolean
}

export interface ToolFunctionContext {
  userId?: string
}

export interface ToolAuthParams {
  llmModel: LlmModel
  messages: dto.Message[]
  assistantId: string
  userId?: string
  toolCallId: string
  toolName: string
  params: Record<string, unknown>
  debug?: boolean
}

export interface ToolFunction {
  description: string
  parameters?: JSONSchema7
  auth?: (params: ToolAuthParams) => Promise<dto.ToolAuthRequest | null>
  invoke: (params: ToolInvokeParams) => Promise<dto.ToolCallResultOutput>
  requireConfirm?: boolean
  type?: undefined
}

export interface ToolNative {
  type: 'provider'
  id: `${string}.${string}`
  args: Record<string, unknown>
}

export type ToolFunctions = Record<string, ToolFunction | ToolNative>

export interface ToolImplementationUploadParams {
  fileId: string
  fileName: string
  contentType: string
  contentStream: ReadableStream
  assistantId?: string
}

export interface ToolImplementationUploadResult {
  externalId: string
}

export interface ToolParams {
  id: string
  provisioned: boolean
  promptFragment: string
  name: string
}

export interface ToolImplementation {
  supportedMedia: string[]
  toolParams: ToolParams
  functions: (model: LlmModel, context?: ToolFunctionContext) => Promise<ToolFunctions>
  getAuthRequest?: (context?: ToolFunctionContext) => Promise<dto.ToolAuthRequest | null>
  contributeToChat?: (
    messages: ai.ModelMessage[],
    knowledge: dto.AssistantFile[],
    llmModel: LlmModel
  ) => Promise<ai.ModelMessage[]>
  isModelSupported?: (model: LlmModel) => boolean
  providerOptions?: (model: LlmModel) => SharedV2ProviderOptions
}

export type ToolBuilder = (
  tool: ToolParams,
  params: Record<string, unknown>,
  model: string
) => Promise<ToolImplementation> | ToolImplementation
