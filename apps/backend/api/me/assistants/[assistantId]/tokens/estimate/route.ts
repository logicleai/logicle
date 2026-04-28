import { error, errorSpec, notFound, ok, operation, responseSpec } from '@/lib/routes'
import { ChatAssistant } from '@/backend/lib/chat'
import { createTokenDetailCollector, estimateInputTokens } from '@/backend/lib/chat/token-estimator'
import { llmModels } from '@/lib/models'
import { flatten } from '@/lib/chat/conversationUtils'
import { getUserParameters } from '@/lib/parameters'
import {
  assistantVersionFiles,
  getPublishedAssistantVersion,
  getUserAssistants,
} from '@/models/assistant'
import { getConversation, getConversationMessages } from '@/models/conversation'
import { tokenEstimateRequestSchema, tokenEstimateResponseSchema } from '@/types/dto'
import { tokenizerForModel } from '@/lib/chat/tokenizer'
import { availableToolsForAssistantVersion } from '@/backend/lib/tools/enumerate'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const detailQuerySchema = z.object({
  detail: z.coerce.boolean().optional(),
})

export const POST = operation({
  name: 'Estimate input tokens',
  description:
    'Estimate non-cumulative input tokens for a message request on a specific assistant/model.',
  authentication: 'user',
  requestBodySchema: tokenEstimateRequestSchema,
  querySchema: detailQuerySchema,
  responses: [
    responseSpec(200, tokenEstimateResponseSchema),
    errorSpec(400),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session, body, query }) => {
    const assistantId = params.assistantId
    const assistants = await getUserAssistants(
      {
        assistantId,
        userId: session.userId,
      },
      'published'
    )
    if (assistants.length === 0) {
      return notFound('Assistant not found')
    }
    const assistantVersion = await getPublishedAssistantVersion(assistantId)
    if (!assistantVersion) {
      return notFound('Assistant version not found')
    }

    const model = llmModels.find((candidate) => candidate.id === assistantVersion.model)
    if (!model) {
      return error(400, 'Model not available for estimation', { model: assistantVersion.model })
    }

    let history = [] as Awaited<ReturnType<typeof getConversationMessages>>
    if (body.conversationId) {
      const conversation = await getConversation(body.conversationId)
      if (!conversation || conversation.ownerId !== session.userId) {
        return notFound('Conversation not found')
      }
      if (conversation.assistantId !== assistantId) {
        return error(400, 'Conversation assistant mismatch', {
          conversationAssistantId: conversation.assistantId,
          assistantId,
        })
      }
      const messages = await getConversationMessages(body.conversationId)
      if (body.targetMessageId) {
        const targetMessage = messages.find((msg) => msg.id === body.targetMessageId)
        if (!targetMessage) {
          return notFound('Target message not found')
        }
      }
      history = flatten(messages, body.targetMessageId ?? undefined)
    }

    const files = await assistantVersionFiles(assistantVersion.id)
    const availableTools = await availableToolsForAssistantVersion(
      assistantVersion.id,
      assistantVersion.model
    )
    const collector = query?.detail ? createTokenDetailCollector() : undefined
    const result = await estimateInputTokens(
      {
        assistantParams: ChatAssistant.assistantParamsFrom(assistantVersion),
        model,
        tools: availableTools,
        parameters: await getUserParameters(session.userId),
        knowledgeFiles: files,
        history,
        draftText: body.draftText,
        attachmentFileIds: body.attachmentFileIds,
      },
      collector
    )
    return ok({
      assistantId,
      model: model.id,
      tokenizer: tokenizerForModel(model),
      estimate: result.estimate,
      detail: result.detail,
    })
  },
})
