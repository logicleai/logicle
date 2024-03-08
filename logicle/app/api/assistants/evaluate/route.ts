import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { InsertableAssistant, SelectableAssistant } from '@/types/dto'
import { MessageDTO, Role } from '@/types/chat'
import { LLMStream } from '@/lib/openai'
import { getBackend } from 'models/backend'
import { OpenAIMessage } from '@/types/openai'
import { createResponse } from '../../chat/utils'
import { availableToolsFiltered } from '@/lib/tools/enumerate'

export const dynamic = 'force-dynamic'

interface EvaluateAssistantRequest {
  assistant: SelectableAssistant
  messages: MessageDTO[]
}

export const POST = requireAdmin(async (req: Request) => {
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
