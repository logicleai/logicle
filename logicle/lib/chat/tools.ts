import * as dto from '@/types/dto'
import { JSONSchema7 } from 'json-schema'

export interface ToolUILink {
  newMessage: () => Promise<void>
  appendText: (text: string) => void
  addAttachment: (attachment: dto.Attachment) => void
}

export interface ToolInvokeParams {
  messages: dto.Message[]
  assistantId: string
  params: Record<string, any>
  uiLink: ToolUILink
}

export interface ToolFunction {
  description: string
  parameters?: JSONSchema7
  invoke: (params: ToolInvokeParams) => Promise<string>
  requireConfirm?: boolean
}

export type ToolFunctions = Record<string, ToolFunction>

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

export interface ToolImplementation {
  functions: Record<string, ToolFunction>
  processFile?: (params: ToolImplementationUploadParams) => Promise<ToolImplementationUploadResult>
  deleteDocuments?: (docIds: string[]) => Promise<void>
}

export type ToolBuilder = (
  params: Record<string, any>
) => Promise<ToolImplementation> | ToolImplementation
