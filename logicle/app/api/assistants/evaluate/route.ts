import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { dtoMessageToLlmMessage } from '@/lib/chat/conversion'
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

  const llmMessages = await Promise.all(
    messages
      .filter((m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse)
      .map(dtoMessageToLlmMessage)
  )
  const enabledToolIds = assistant.tools.filter((a) => a.enabled).map((a) => a.id)
  const availableTools = await availableToolsFiltered(enabledToolIds)
  const availableFunctions = Object.fromEntries(
    availableTools.flatMap((tool) => Object.entries(tool.functions))
  )

  const provider = new ChatAssistant(
    backend,
    {
      model: assistant.model,
      assistantId: assistant.id,
      systemPrompt: assistant.systemPrompt,
      temperature: assistant.temperature,
    },
    availableFunctions
  )

  if (messages[messages.length - 1].toolCallAuthResponse) {
    const userMessage = messages[messages.length - 1]
    const parentMessage = messages.find((m) => m.id == userMessage.parent)!
    const llmResponseStream: ReadableStream<string> = await provider.sendToolCallAuthResponse(
      llmMessages,
      messages,
      userMessage,
      parentMessage.toolCallAuthRequest!
    )
    return new NextResponse(llmResponseStream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const stream: ReadableStream<string> = await provider.sendUserMessageAndStreamResponse({
      llmMessages,
      dbMessages: messages,
      conversationId: messages[messages.length - 1].conversationId,
      parentMsgId: messages[messages.length - 1].id,
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  }
})
