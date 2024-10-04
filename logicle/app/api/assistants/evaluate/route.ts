import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { Session } from 'next-auth'
import { NextResponse } from 'next/server'
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
      tokenLimit: assistant.tokenLimit,
    },
    availableFunctions
  )

  const stream: ReadableStream<string> = await provider.sendUserMessageAndStreamResponse({
    chatHistory: messages,
    conversationId: messages[messages.length - 1].conversationId,
    parentMsgId: messages[messages.length - 1].id,
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Encoding': 'none',
      'Content-Type': 'text/event-stream',
    },
  })
})
