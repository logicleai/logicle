import * as ai from 'ai'
import * as schema from '@/db/schema'
import { CoreMessage } from 'ai'
import fs from 'fs'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { logger } from '../logging'

const loadImagePartFromFileEntry = async (fileEntry: schema.File) => {
  const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
  const fileContent = await fs.promises.readFile(`${fileStorageLocation}/${fileEntry.path}`)
  const image: ai.ImagePart = {
    type: 'image',
    image: `data:${fileEntry.type};base64,${fileContent.toString('base64')}`,
  }
  return image
}

// Not easy to do it right... Claude will crash if the input image format is not supported
// But if a user uploads say a image/svg+xml file, and we simply remove it here...
// we might crash for empty content, or the LLM can complain because nothing is uploaded
// The issue is even more seriouos because if a signle request is not valid, we can't continue the conversation!!!
const acceptableImageTypes = ['image/jpeg', 'image/png', 'image/webp']
export const dtoMessageToLlmMessage = async (
  m: dto.Message
): Promise<ai.CoreMessage | undefined> => {
  if (m.toolCallAuthRequest || m.toolCallAuthResponse || m.toolOutput) return undefined
  const message = {
    role: m.role,
    content: m.content,
  } as CoreMessage
  if (m.toolCallResult) {
    return {
      role: 'tool',
      content: [
        {
          toolCallId: m.toolCallResult.toolCallId,
          toolName: m.toolCallResult.toolName,
          result: m.toolCallResult.result,
          type: 'tool-result',
        },
      ],
    }
  }
  if (m.toolCall) {
    return {
      role: 'assistant',
      content: [
        {
          toolCallId: m.toolCall.toolCallId,
          toolName: m.toolCall.toolName,
          args: m.toolCall.args,
          type: 'tool-call',
        },
      ],
    }
  }

  if ((m.attachments.length != 0 || m.toolCall) && message.role == 'user') {
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
          if (!acceptableImageTypes.includes(fileEntry.type)) {
            return undefined
          }
          return loadImagePartFromFileEntry(fileEntry)
        })
      )
    ).filter((a) => a != undefined)
    message.content = [...messageParts, ...imageParts]
  }
  return message
}

export const sanitizeOrphanToolCalls = (messages: ai.CoreMessage[]) => {
  const pendingToolCalls = new Map<string, ai.ToolCallPart>()
  const output: ai.CoreMessage[] = []

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
            result: 'not available',
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
