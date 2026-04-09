import * as ai from 'ai'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { ensureFileAnalysis } from '@/lib/file-analysis'
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

const toolResultAttachmentText = (fileEntry: schema.File) =>
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

export const loadImagePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.ImagePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

export const loadFilePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.FilePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.FilePart = {
    type: 'file',
    filename: fileEntry.name,
    data: fileContent.toString('base64'),
    mediaType: fileEntry.type,
  }
  return image
}

const dtoFileToTextPart = async (fileEntry: schema.File): Promise<ai.TextPart> => {
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
  fileEntry: schema.File,
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
  fileEntry: schema.File,
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
  fileEntry: schema.File,
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
  if (m.role === 'user-request') return undefined
  if (m.role === 'user-response') return undefined
  if (m.role === 'tool') {
    const results = m.parts.filter((m) => m.type === 'tool-result')
    if (results.length === 0) return undefined
    const convertOutput = async (
      output: dto.ToolCallResultOutput
    ): Promise<ToolCallResultOutput> => {
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
            output: await convertOutput(result.result),
            type: 'tool-result',
          }
        })
      ),
    }
  } else if (m.role === 'assistant') {
    type ContentArrayElement = Extract<ai.AssistantContent, any[]>[number]
    const parts: ContentArrayElement[] = []
    m.parts.forEach((part) => {
      if (part.type === 'tool-call') {
        parts.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.args,
        })
      } else if (part.type === 'text') {
        parts.push({
          type: 'text',
          text: part.text,
        })
      } else if (part.type === 'builtin-tool-result') {
        // builtin tools are just... notifications
      } else if (part.type === 'reasoning' && part.reasoning_signature) {
        parts.push({
          type: 'reasoning',
          text: part.reasoning,
          providerOptions: {
            anthropic: {
              signature: part.reasoning_signature,
            },
          },
        })
      }
    })
    return {
      role: 'assistant',
      content: parts,
    }
  }
  const message: ai.ModelMessage = {
    role: m.role,
    content: m.content,
  }
  if (m.attachments.length !== 0) {
    const messageParts: typeof message.content = []
    if (m.content.length !== 0)
      messageParts.push({
        type: 'text',
        text: m.content,
      })
    const fileParts = (
      await Promise.all(
        m.attachments.map(async (a) => {
          const fileEntry = await getFileWithId(a.id)
          if (!fileEntry) {
            logger.warn(`Can't find entry for attachment ${a.id}`)
            return undefined
          }
          return await dtoFileToLlmFilePart(fileEntry, capabilities)
        })
      )
    ).filter((a) => a !== undefined)
    if (m.attachments.length) {
      messageParts.push({
        type: 'text',
        text: `The user has attached the following files to this chat: \n${JSON.stringify(
          m.attachments
        )}`,
      })
    }
    message.content = [...messageParts, ...fileParts]
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
