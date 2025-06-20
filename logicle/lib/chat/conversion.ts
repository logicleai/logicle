import * as ai from 'ai'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import { storage } from '@/lib/storage'
import { LlmModelCapabilities } from './models'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'
import { llmModels } from '../models'

interface ReasoningPart {
  type: 'reasoning'
  text: string
  providerOptions: SharedV2ProviderOptions
}

const loadImagePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.ImagePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, fileEntry.encrypted ? true : false)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

const loadFilePartFromFileEntry = async (fileEntry: schema.File): Promise<ai.FilePart> => {
  const fileContent = await storage.readBuffer(fileEntry.path, fileEntry.encrypted ? true : false)
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
  if (m.role == 'tool-auth-request') return undefined
  if (m.role == 'tool-auth-response') return undefined
  if (m.role == 'tool-debug') return undefined
  if (m.role == 'tool-output') return undefined
  if (m.role == 'error') return undefined
  if (m.role == 'tool-result') {
    return {
      role: 'tool',
      content: [
        {
          toolCallId: m.toolCallId,
          toolName: m.toolName,
          output: m.result,
          type: 'tool-result',
        },
      ],
    }
  }
  if (m.role == 'tool-call') {
    const reasoningParts: ReasoningPart[] =
      m.reasoning && m.reasoning_signature
        ? [
            {
              type: 'reasoning',
              text: m.reasoning,
              // TODO: this is horrible....
              providerOptions: {
                anthropic: {
                  signature: m.reasoning_signature,
                },
              },
            },
          ]
        : []
    return {
      role: 'assistant',
      content: [
        ...reasoningParts,
        {
          toolCallId: m.toolCallId,
          toolName: m.toolName,
          input: m.args,
          type: 'tool-call',
        },
      ],
    }
  }

  const message: ai.ModelMessage = {
    role: m.role,
    content: m.content,
  }
  if (m.attachments.length != 0 && message.role == 'user') {
    const messageParts: typeof message.content = []
    if (m.content.length != 0)
      messageParts.push({
        type: 'text',
        text: m.content,
      })
    const imageParts = (
      await Promise.all(
        m.attachments.map(async (a) => {
          messageParts.push({
            type: 'text',
            text: `Uploaded file ${a.name} id ${a.id} type ${a.mimetype}`,
          })
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
          }
          return undefined
        })
      )
    ).filter((a) => a != undefined)
    message.content = [...messageParts, ...imageParts]
  }
  return message
}

export const sanitizeOrphanToolCalls = (messages: ai.CoreMessage[]) => {
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
            output: 'not available',
          },
        ],
      })
    }
    pendingToolCalls.clear()
  }

  for (const message of messages) {
    if (message.role == 'tool') {
      for (const part of message.content) {
        pendingToolCalls.delete(part.toolCallId)
      }
    } else {
      addFakeToolResults()
    }
    output.push(message)
    if (message.role == 'assistant' && typeof message.content != 'string') {
      for (const part of message.content) {
        if (part.type == 'tool-call') {
          pendingToolCalls.set(part.toolCallId, part)
        }
      }
    }
  }
  return output
}
