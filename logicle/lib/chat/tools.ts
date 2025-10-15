import * as dto from '@/types/dto'
import { LanguageModelV2ToolResultOutput, SharedV2ProviderOptions } from '@ai-sdk/provider'
import { JSONSchema7 } from 'json-schema'
import { LlmModel } from './models'
import * as ai from 'ai'

export interface ToolUILink {
  debugMessage: (displayMessage: string, data: Record<string, unknown>) => void
  addAttachment: (attachment: dto.Attachment) => void
  addCitations: (citations: dto.Citation[]) => void
  attachments: dto.Attachment[]
  citations: dto.Citation[]
}

export interface ToolInvokeParams {
  llmModel: LlmModel
  messages: dto.Message[]
  assistantId: string
  params: Record<string, unknown>
  uiLink: ToolUILink
  debug?: boolean
}

export interface ToolFunction {
  description: string
  parameters?: JSONSchema7
  invoke: (params: ToolInvokeParams) => Promise<LanguageModelV2ToolResultOutput | unknown>
  requireConfirm?: boolean
  type?: undefined
}

export interface ToolNative {
  type: 'provider-defined'
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
  provisioned: boolean
  promptFragment: string
  name: string
}

export interface ToolImplementation {
  supportedMedia: string[]
  toolParams: ToolParams
  functions: (model: string) => Promise<ToolFunctions>
  contributeToChat?: (
    messages: ai.ModelMessage[],
    knowledge: dto.AssistantFile[],
    llmModel: LlmModel
  ) => Promise<ai.ModelMessage[]>
  providerOptions?: (model: string) => SharedV2ProviderOptions
}

export type ToolBuilder = (
  tool: ToolParams,
  params: Record<string, unknown>,
  model: string
) => Promise<ToolImplementation> | ToolImplementation
