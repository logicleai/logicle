import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

interface EvaluateAssistantRequest {
  assistant: dto.AssistantDraft
  messages: dto.Message[]
}

export const POST = requireSession(async (session: SimpleSession, req: Request) => {
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

  const provider = await ChatAssistant.build(
    backend,
    {
      model: assistant.model,
      assistantId: assistant.id,
      systemPrompt: assistant.systemPrompt,
      temperature: assistant.temperature,
      tokenLimit: assistant.tokenLimit,
      reasoning_effort: assistant.reasoning_effort,
    },
    availableFunctions,
    {
      debug: true,
      user: session.userId,
    }
  )

  const stream: ReadableStream<string> = await provider.sendUserMessageAndStreamResponse(messages)

  return new NextResponse(stream, {
    headers: {
      'Content-Encoding': 'none',
      'Content-Type': 'text/event-stream',
    },
  })
})
