import * as ai from 'ai'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import { storage } from '@/lib/storage'
import { LlmModelCapabilities } from './models'
import env from '../env'
import { cachingExtractor } from '../textextraction/cache'

const loadImagePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.ImagePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

const loadFilePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.FilePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
  const image: ai.FilePart = {
    type: 'file',
    data: fileContent.toString('base64'),
    mediaType: fileEntry.type,
  }
  return image
}

// Not easy to do it right... Claude will crash if the input image format is not supported
// But if a user uploads say a image/svg+xml file, and we simply remove it here...
// we might crash for empty content, or the LLM can complain because nothing is uploaded
// The issue is even more serious because if a signle request is not valid, we can't continue the conversation!!!
const acceptableImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export const dtoMessageToLlmMessage = async (
  m: dto.Message,
  capabilities: LlmModelCapabilities
): Promise<ai.ModelMessage | undefined> => {
  if (m.role === 'tool-auth-request') return undefined
  if (m.role === 'tool-auth-response') return undefined
  if (m.role === 'tool') {
    const results = m.parts.filter((m) => m.type === 'tool-result')
    if (results.length === 0) return undefined
    return {
      role: 'tool',
      content: results.map((result) => {
        return {
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          output: {
            type: 'json',
            value: result.result,
          },
          type: 'tool-result',
        }
      }),
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
          if (capabilities.vision && acceptableImageTypes.includes(fileEntry.type)) {
            return loadImagePartFromFileEntry(fileEntry)
          }
          if (capabilities.supportedMedia?.includes(fileEntry.type)) {
            return loadFilePartFromFileEntry(fileEntry)
          } else {
            if (env.chat.enableAttachmentConversion) {
              const text = await cachingExtractor.extractFromFile(fileEntry)
              if (text) {
                return {
                  type: 'text',
                  text: `Here is the text content of the file "${fileEntry.name}" with id ${fileEntry.id}\n${text}`,
                } satisfies ai.TextPart
              }
            }
            return {
              type: 'text',
              text: `The content of the file "${fileEntry.name}" with id ${fileEntry.id} could not be extracted. It is possible that some tools can return the content on demand`,
            } satisfies ai.TextPart
          }
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
        pendingToolCalls.delete(part.toolCallId)
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
