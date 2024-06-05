import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { LLMStream } from '@/lib/openai'
import { getBackend } from '@/models/backend'
import { Message } from '@logicleai/llmosaic/dist/types'
import { createResponse } from '../../chat/utils'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { Session } from 'next-auth'

export const dynamic = 'force-dynamic'

interface EvaluateAssistantRequest {
  assistant: dto.AssistantWithTools
  messages: dto.MessageDTO[]
}

export const POST = requireSession(async (session: Session, req: Request) => {
  const { assistant, messages } = (await req.json()) as EvaluateAssistantRequest

  console.log()

  const backend = await getBackend(assistant.backendId)
  if (!backend) {
    return ApiResponses.invalidParameter('No backend')
  }

  const messagesToSend = messages.map((m) => {
    return {
      role: m.role as dto.Role,
      content: m.content,
    } as Message
  })

  const enabledToolIds = assistant.tools.filter((a) => a.enabled).map((a) => a.id)
  const availableFunctions = (await availableToolsFiltered(enabledToolIds)).flatMap(
    (p) => p.functions
  )
  const stream: ReadableStream<string> = await LLMStream(
    backend.providerType,
    backend.endPoint,
    assistant.model,
    backend.apiKey,
    assistant.id,
    assistant.systemPrompt,
    assistant.temperature,
    messagesToSend,
    messages,
    availableFunctions,
    session.user.id
  )

  return createResponse(messages[messages.length - 1], stream)
})
