import * as dto from '@/types/dto'
import { JSONSchema7 } from 'json-schema'

export interface ToolUILink {
  debugMessage: (displayMessage: string, data: Record<string, unknown>) => Promise<void>
  newMessage: (debug?: boolean) => Promise<void>
  appendText: (text: string) => void
  addAttachment: (attachment: dto.Attachment) => void
  addCitations: (citations: dto.Citation[]) => void
  attachments: dto.Attachment[]
  citations: dto.Citation[]
}

export interface ToolInvokeParams {
  messages: dto.Message[]
  assistantId: string
  params: Record<string, unknown>
  uiLink: ToolUILink
  debug?: boolean
}

export interface ToolFunction {
  description: string
  parameters?: JSONSchema7
  invoke: (params: ToolInvokeParams) => Promise<any>
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
}

export interface ToolImplementation {
  supportedMedia: string[]
  toolParams: ToolParams
  functions: ToolFunctions
}

export type ToolBuilder = (
  tool: ToolParams,
  params: Record<string, unknown>
) => Promise<ToolImplementation> | ToolImplementation
