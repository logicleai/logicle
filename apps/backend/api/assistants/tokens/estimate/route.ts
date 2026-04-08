import { ChatAssistant } from '@/backend/lib/chat'
import { createTokenDetailCollector, estimateConversationWindowTokens } from '@/backend/lib/chat/token-estimator'
import { llmModels } from '@/lib/models'
import { getUserParameters } from '@/lib/parameters'
import { error, errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import { availableToolsFiltered } from '@/backend/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { tokenizerForModel } from '@/lib/chat/tokenizer'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const detailQuerySchema = z.object({
  detail: z.coerce.boolean().optional(),
})

export const POST = operation({
  name: 'Estimate assistant draft input tokens',
  description: 'Estimate non-cumulative input tokens for an assistant draft and message list.',
  authentication: 'user',
  requestBodySchema: dto.assistantTokenEstimateRequestSchema,
  querySchema: detailQuerySchema,
  responses: [responseSpec(200, dto.assistantTokenEstimateResponseSchema), errorSpec(400)] as const,
  implementation: async ({ session, body, query }) => {
    const { assistant, messages } = body
    const model = llmModels.find((candidate) => candidate.id === assistant.model)
    if (!model) {
      return error(400, 'Model not available for estimation', { model: assistant.model })
    }

    const conversationId = messages[0]?.conversationId || assistant.id || 'preview'
    const normalizedMessages =
      messages.length === 0
        ? messages
        : messages[0].conversationId === conversationId
        ? messages
        : messages.map((msg) => (msg.conversationId ? msg : { ...msg, conversationId }))
    const availableTools = await availableToolsFiltered(assistant.tools, assistant.model)
    const collector = query?.detail ? createTokenDetailCollector() : undefined
    const result = await estimateConversationWindowTokens(
      {
        assistantParams: ChatAssistant.assistantParamsFrom(assistant),
        model,
        tools: availableTools,
        parameters: await getUserParameters(session.userId),
        knowledgeFiles: assistant.files,
        history: normalizedMessages,
      },
      collector
    )

    return ok({
      assistantId: assistant.id,
      model: model.id,
      tokenizer: tokenizerForModel(model),
      estimate: {
        assistant: result.estimate.assistant,
        messages: result.estimate.history,
        total: result.estimate.assistant + result.estimate.history,
      },
      detail: result.detail,
    })
  },
})
