import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { ChatAssistant } from '@/lib/chat'
import { getBackend } from '@/models/backend'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { NextResponse } from 'next/server'
import { getUserPropertyValuesAsNameRecord } from '@/models/user'
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

  const availableTools = await availableToolsFiltered(assistant.tools, assistant.model)

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
    await getUserPropertyValuesAsNameRecord(session.userId),
    availableTools,
    assistant.files,
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
