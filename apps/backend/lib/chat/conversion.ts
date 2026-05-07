import * as ai from 'ai'
import { type FileDbRow } from '@/backend/models/file'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { ensureFileAnalysis } from '@/lib/file-analysis'
import { UserVisibleError } from '@/backend/lib/chat'
import { logger } from '@/lib/logging'
import { storage } from '@/lib/storage'
import { LlmModelCapabilities } from '@/lib/chat/models'
import { cachingExtractor } from '@/lib/textextraction/cache'
import {
  acceptableImageTypes,
  canSendAsNativeFile,
  canSendAsNativeImage,
  resolvePdfNativeAttachmentDecision,
} from './file-attachment-policy'

// LiteLLM does not support binary attachments inside tool results. Detect this by inspecting
// the AI SDK provider string rather than storing the limitation in model capabilities.
const supportsToolResultAttachments = (providerName: string) =>
  !providerName.startsWith('litellm')

const toolResultAttachmentText = (fileEntry: FileDbRow) =>
  `The tool returned a file attachment "${fileEntry.name}" (${fileEntry.type}, id ${fileEntry.id}) that is available in the UI, but this provider cannot receive binary tool attachments.`
type ToolCallResultOutput = ai.ToolResultPart['output']

const describeAttachedFiles = (
  files: Array<{ id: string; name: string; size: number; mimetype: string }>
) => ({
  attached_files: files.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    mimetype: f.mimetype,
  })),
})

export const userMessageMetadataText = (message: dto.UserMessage): string | undefined =>
  message.metadata
    ? `Message metadata (system-use): ${JSON.stringify(message.metadata)}`
    : undefined

export const userAttachmentDescriptorText = (message: dto.UserMessage): string | undefined =>
  message.attachments.length === 0
    ? undefined
    : `The user has attached the following files to this chat: \n${JSON.stringify(message.attachments)}`

export const shouldIncludeAssistantReasoningPart = (part: dto.ReasoningPart): boolean =>
  Boolean(part.reasoning_signature)

export const projectedAssistantToolCallPayload = (part: dto.ToolCallPart) => ({
  toolCallId: part.toolCallId,
  toolName: part.toolName,
  input: part.args,
})

export const projectedToolResultMetaPayload = (part: dto.ToolCallResultPart) => ({
  toolCallId: part.toolCallId,
  toolName: part.toolName,
})

export type EstimationProjectionItem =
  | {
      kind: 'text'
      text: string
      source?: 'content' | 'metadata' | 'attachment_descriptor' | 'assistant_text' | 'assistant_reasoning'
      reasoningSignature?: string
    }
  | {
      kind: 'attachment'
      attachment: dto.Attachment
    }
  | {
      kind: 'tool_call'
      toolCallId: string
      toolName: string
      payload: ReturnType<typeof projectedAssistantToolCallPayload>
    }
  | {
      kind: 'tool_result'
      toolCallId: string
      toolName: string
      metaPayload: ReturnType<typeof projectedToolResultMetaPayload>
      output: dto.ToolCallResultOutput
    }

export type EstimationMessageProjection =
  | { role: 'user' | 'assistant' | 'tool'; items: EstimationProjectionItem[] }
  | { role: 'ignored'; items: [] }

export const projectMessageForEstimation = (message: dto.Message): EstimationMessageProjection => {
  if (message.role === 'user-request' || message.role === 'user-response') {
    return { role: 'ignored', items: [] }
  }
  if (message.role === 'user') {
    const items: EstimationProjectionItem[] = []
    const metadataText = userMessageMetadataText(message)
    if (metadataText) items.push({ kind: 'text', text: metadataText, source: 'metadata' })
    if (message.content.length !== 0) items.push({ kind: 'text', text: message.content, source: 'content' })
    const attachmentDescriptorText = userAttachmentDescriptorText(message)
    if (attachmentDescriptorText) {
      items.push({
        kind: 'text',
        text: attachmentDescriptorText,
        source: 'attachment_descriptor',
      })
    }
    for (const attachment of message.attachments) {
      items.push({ kind: 'attachment', attachment })
    }
    return { role: 'user', items }
  }
  if (message.role === 'assistant') {
    const items: EstimationProjectionItem[] = []
    for (const part of message.parts) {
      if (part.type === 'text') {
        items.push({ kind: 'text', text: part.text, source: 'assistant_text' })
      } else if (part.type === 'reasoning' && shouldIncludeAssistantReasoningPart(part)) {
        items.push({
          kind: 'text',
          text: part.reasoning,
          source: 'assistant_reasoning',
          reasoningSignature: part.reasoning_signature,
        })
      } else if (part.type === 'tool-call') {
        const payload = projectedAssistantToolCallPayload(part)
        items.push({
          kind: 'tool_call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          payload,
        })
      }
    }
    return { role: 'assistant', items }
  }
  const items: EstimationProjectionItem[] = []
  for (const part of message.parts) {
    if (part.type !== 'tool-result') continue
    items.push({
      kind: 'tool_result',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      metaPayload: projectedToolResultMetaPayload(part),
      output: part.result,
    })
  }
  return { role: 'tool', items }
}

export const loadImagePartFromFileEntry = async (fileEntry: FileDbRow): Promise<ai.ImagePart> => {
  let fileContent: Buffer
  try {
    fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  } catch (err) {
    throw new UserVisibleError(`File not readable: "${fileEntry.name}" (id: ${fileEntry.id})`, { cause: err })
  }
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

export const loadFilePartFromFileEntry = async (fileEntry: FileDbRow): Promise<ai.FilePart> => {
  let fileContent: Buffer
  try {
    fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  } catch (err) {
    throw new UserVisibleError(`File not readable: "${fileEntry.name}" (id: ${fileEntry.id})`, { cause: err })
  }
  const image: ai.FilePart = {
    type: 'file',
    filename: fileEntry.name,
    data: fileContent.toString('base64'),
    mediaType: fileEntry.type,
  }
  return image
}

const dtoFileToTextPart = async (fileEntry: FileDbRow): Promise<ai.TextPart> => {
  const text = await cachingExtractor.extractFromFile(fileEntry)
  if (text) {
    return {
      type: 'text',
      text: `Here is the text content of the file "${fileEntry.name}" with id ${fileEntry.id}\n${text}`,
    } satisfies ai.TextPart
  }
  return {
    type: 'text',
    text: `The content of the file "${fileEntry.name}" with id ${fileEntry.id} could not be extracted. It is possible that some tools can return the content on demand`,
  } satisfies ai.TextPart
}

const ensurePdfAttachmentCanBeSentNatively = async (
  fileEntry: FileDbRow,
  capabilities: LlmModelCapabilities
): Promise<ai.TextPart | null> => {
  if (fileEntry.type !== 'application/pdf' || capabilities.nativePdfPageLimit === undefined) {
    return null
  }
  const analysis = await ensureFileAnalysis(fileEntry)
  const decision = resolvePdfNativeAttachmentDecision(fileEntry, capabilities, analysis)
  if (decision.kind === 'native-file') {
    return null
  }
  if (decision.reason === 'analysis-failed') {
    logger.warn('PDF native attachment disabled: analysis failed', {
      fileId: fileEntry.id,
      fileName: fileEntry.name,
      analysisStatus: analysis.status,
    })
    return dtoFileToTextPart(fileEntry)
  }
  if (decision.reason === 'unexpected-payload') {
    logger.warn('PDF native attachment disabled: unexpected analysis payload', {
      fileId: fileEntry.id,
      fileName: fileEntry.name,
      analysisKind: analysis.kind,
    })
    return dtoFileToTextPart(fileEntry)
  }
  return { type: 'text', text: decision.text }
}

export const dtoFileToLlmFilePart = async (
  fileEntry: FileDbRow,
  capabilities: LlmModelCapabilities
) => {
  if (canSendAsNativeImage(fileEntry.type, capabilities))
    return loadImagePartFromFileEntry(fileEntry)
  else if (canSendAsNativeFile(fileEntry.type, capabilities)) {
    const pdfFallback = await ensurePdfAttachmentCanBeSentNatively(fileEntry, capabilities)
    if (pdfFallback) {
      return pdfFallback
    }
    return loadFilePartFromFileEntry(fileEntry)
  } else return dtoFileToTextPart(fileEntry)
}

const dtoFileToToolResultOutputPart = async (
  fileEntry: FileDbRow,
  capabilities: LlmModelCapabilities,
  providerName: string
): Promise<
  | { type: 'text'; text: string }
  | { type: 'image-data'; data: string; mediaType: string }
  | { type: 'file-data'; data: string; mediaType: string }
> => {
  if (!supportsToolResultAttachments(providerName)) {
    return {
      type: 'text',
      text: toolResultAttachmentText(fileEntry),
    }
  }
  if (canSendAsNativeImage(fileEntry.type, capabilities)) {
    const data = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    return {
      type: 'image-data',
      data: data.toString('base64'),
      mediaType: fileEntry.type,
    }
  }
  if (canSendAsNativeFile(fileEntry.type, capabilities)) {
    const pdfFallback = await ensurePdfAttachmentCanBeSentNatively(fileEntry, capabilities)
    if (pdfFallback) {
      return {
        type: 'text',
        text: pdfFallback.text,
      }
    }
    const data = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    return {
      type: 'file-data',
      data: data.toString('base64'),
      mediaType: fileEntry.type,
    }
  }
  return dtoFileToTextPart(fileEntry)
}

export const dtoMessageToLlmMessage = async (
  m: dto.Message,
  capabilities: LlmModelCapabilities,
  providerName: string
): Promise<ai.ModelMessage | undefined> => {
  const projected = projectMessageForEstimation(m)
  if (projected.role === 'ignored') return undefined
  if (projected.role === 'tool') {
    const results = projected.items.filter((item) => item.kind === 'tool_result')
    if (results.length === 0) return undefined
    const convertOutput = async (output: dto.ToolCallResultOutput): Promise<ToolCallResultOutput> => {
      if ((output as dto.ToolCallResultOutput).type) {
        switch (output.type) {
          case 'text':
          case 'json':
          case 'error-json':
          case 'error-text':
            return output
          case 'content': {
            const files = output.value.filter((v) => v.type === 'file')
            const description = describeAttachedFiles(files)
            const outputs = await Promise.all(
              output.value.map(async (v) => {
                switch (v.type) {
                  case 'text':
                    return v
                  case 'file': {
                    const fileEntry = await getFileWithId(v.id)
                    if (!fileEntry) {
                      throw new Error(`Can't find entry for attachment ${v.id}`)
                    }
                    return dtoFileToToolResultOutputPart(fileEntry, capabilities, providerName)
                  }
                }
              })
            )
            return {
              type: 'content',
              value: [
                ...(files.length === 0
                  ? []
                  : [
                      {
                        type: 'text' as const,
                        text: JSON.stringify(description),
                      },
                    ]),
                ...outputs,
              ],
            } satisfies ToolCallResultOutput
          }
        }
      } else {
        return {
          type: 'json',
          value: output as ai.JSONValue,
        }
      }
    }
    return {
      role: 'tool',
      content: await Promise.all(
        results.map(async (result) => {
          return {
            toolCallId: result.toolCallId,
            toolName: result.toolName,
            output: await convertOutput(result.output),
            type: 'tool-result',
          }
        })
      ),
    }
  } else if (projected.role === 'assistant') {
    type ContentArrayElement = Extract<ai.AssistantContent, any[]>[number]
    const parts: ContentArrayElement[] = []
    projected.items.forEach((item) => {
      if (item.kind === 'tool_call') {
        parts.push({
          type: 'tool-call',
          toolCallId: item.toolCallId,
          toolName: item.toolName,
          input: item.payload.input,
        })
      } else if (item.kind === 'text' && item.source === 'assistant_reasoning' && item.reasoningSignature) {
        parts.push({
          type: 'reasoning',
          text: item.text,
          providerOptions: {
            anthropic: {
              signature: item.reasoningSignature,
            },
          },
        })
      } else if (item.kind === 'text') {
        parts.push({
          type: 'text',
          text: item.text,
        })
      }
    })
    return {
      role: 'assistant',
      content: parts,
    }
  }
  const message: ai.ModelMessage = {
    role: 'user',
    content: '',
  }
  const attachments = projected.items.filter((item) => item.kind === 'attachment')
  if (attachments.length !== 0) {
    const messageParts: typeof message.content = []
    for (const item of projected.items) {
      if (item.kind !== 'text') continue
      messageParts.push({ type: 'text', text: item.text })
    }
    const fileParts = (
      await Promise.all(
        attachments.map(async (item) => {
          const fileEntry = await getFileWithId(item.attachment.id)
          if (!fileEntry) {
            logger.warn(`Can't find entry for attachment ${item.attachment.id}`)
            return undefined
          }
          return await dtoFileToLlmFilePart(fileEntry, capabilities)
        })
      )
    ).filter((a) => a !== undefined)
    message.content = [...messageParts, ...fileParts]
  } else {
    const textItems = projected.items.filter((item) => item.kind === 'text')
    const messageParts: typeof message.content = []
    for (const item of textItems) {
      messageParts.push({ type: 'text', text: item.text })
    }
    message.content = messageParts.length > 0 ? messageParts : ''
  }
  return message
}

export const sanitizeOrphanToolCalls = (messages: ai.ModelMessage[]) => {
  const pendingToolCalls = new Map<string, ai.ToolCallPart>()
  const output: ai.ModelMessage[] = []

  const addFakeToolResults = () => {
    for (const [toolCallId, pendingCall] of pendingToolCalls) {
      logger.info('Adding tool response to sanitize ')
      output.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: toolCallId,
            toolName: pendingCall.toolName,
            output: {
              type: 'text',
              value: 'not available',
            },
          },
        ],
      })
    }
    pendingToolCalls.clear()
  }

  for (const message of messages) {
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type === 'tool-result') pendingToolCalls.delete(part.toolCallId)
      }
    } else {
      addFakeToolResults()
    }
    output.push(message)
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      for (const part of message.content) {
        if (part.type === 'tool-call') {
          pendingToolCalls.set(part.toolCallId, part)
        }
      }
    }
  }
  return output
}
