import { requireAdmin, requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { MessageDTO, Role } from '@/types/chat'
import { LLMStream } from '@/lib/openai'
import { getBackend } from '@/models/backend'
import { OpenAIMessage } from '@/types/openai'
import { createResponse } from '../../chat/utils'
import { availableToolsFiltered } from '@/lib/tools/enumerate'
import { Session } from 'next-auth'

export const dynamic = 'force-dynamic'

interface EvaluateAssistantRequest {
  assistant: dto.SelectableAssistantWithTools
  messages: MessageDTO[]
}

export const POST = requireSession(async (session: Session, req: Request) => {
  const { assistant, messages } = (await req.json()) as EvaluateAssistantRequest

  const backend = await getBackend(assistant.backendId)
  if (!backend) {
    return ApiResponses.invalidParameter('No backend')
  }

  const messagesToSend = messages.map((m) => {
    return {
      role: m.role as Role,
      content: m.content,
    } as OpenAIMessage
  })

  const enabledToolIds = assistant.tools.filter((a) => a.enabled).map((a) => a.id)
  const availableFunctions = (await availableToolsFiltered(enabledToolIds)).flatMap(
    (p) => p.functions
  )
  const stream: ReadableStream<string> = LLMStream(
    backend.providerType,
    backend.endPoint,
    assistant.model,
    backend.apiKey,
    assistant.id,
    assistant.systemPrompt,
    assistant.temperature,
    messagesToSend,
    messages,
    availableFunctions
  )

  return createResponse(messages[messages.length - 1], stream, false)
})
