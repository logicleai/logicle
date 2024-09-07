import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import * as ai from 'ai'
import * as schema from '@/db/schema'
import { CoreMessage } from 'ai'
import fs from 'fs'
import { getFileWithId } from '@/models/file'

export const dynamic = 'force-dynamic'

interface EvaluateAssistantRequest {
  assistant: dto.AssistantWithTools
  messages: dto.Message[]
}

export const POST = requireSession(async (session: Session, req: Request) => {
  const { assistant, messages } = (await req.json()) as EvaluateAssistantRequest

  const backend = await getBackend(assistant.backendId)
  if (!backend) {
    return ApiResponses.invalidParameter('No backend')
  }

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
  const dtoMessageToLlmMessage = async (m: dto.Message): Promise<ai.CoreMessage> => {
    const message = {
      role: m.role as dto.MessageType,
      content: m.content,
    } as CoreMessage
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
            const fileEntry = await getFileWithId(a.id)
            if (!fileEntry) {
              console.warn(`Can't find entry for attachment ${a.id}`)
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

  const llmMessages = await Promise.all(messages.map(dtoMessageToLlmMessage))
  const enabledToolIds = assistant.tools.filter((a) => a.enabled).map((a) => a.id)
  const availableFunctions = (await availableToolsFiltered(enabledToolIds)).flatMap(
    (p) => p.functions
  )

  const provider = new ChatAssistant(
    {
      apiKey: backend.apiKey,
      baseUrl: backend.endPoint,
      providerType: backend.providerType,
    },
    {
      model: assistant.model,
      assistantId: assistant.id,
      systemPrompt: assistant.systemPrompt,
      temperature: assistant.temperature,
    },
    availableFunctions
  )

  if (messages[messages.length - 1].confirmResponse) {
    const userMessage = messages[messages.length - 1]
    const parentMessage = messages.find((m) => m.id == userMessage.parent)!
    const llmResponseStream: ReadableStream<string> = await provider.sendConfirmResponse(
      llmMessages,
      messages,
      userMessage,
      parentMessage.confirmRequest!,
      session.user.id
    )
    return new NextResponse(llmResponseStream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const stream: ReadableStream<string> = await provider.sendUserMessage({
      llmMessages,
      dbMessages: messages,
      userId: session.user.id,
      conversationId: messages[messages.length - 1].conversationId,
      userMsgId: messages[messages.length - 1].id,
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  }
})
