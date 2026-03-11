import { error, errorSpec, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { estimateInputTokens } from '@/lib/chat/token-estimator'
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
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Estimate input tokens',
    description:
      'Estimate non-cumulative input tokens for a message request on a specific assistant/model.',
    authentication: 'user',
    requestBodySchema: tokenEstimateRequestSchema,
    responses: [
      responseSpec(200, tokenEstimateResponseSchema),
      errorSpec(400),
      errorSpec(404),
    ] as const,
    implementation: async (
      _req: Request,
      params: { assistantId: string },
      { session, requestBody }
    ) => {
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
      if (requestBody.conversationId) {
        const conversation = await getConversation(requestBody.conversationId)
        if (!conversation || conversation.ownerId !== session.userId) {
          return notFound('Conversation not found')
        }
        if (conversation.assistantId !== assistantId) {
          return error(400, 'Conversation assistant mismatch', {
            conversationAssistantId: conversation.assistantId,
            assistantId,
          })
        }
        const messages = await getConversationMessages(requestBody.conversationId)
        if (requestBody.targetMessageId) {
          const targetMessage = messages.find((msg) => msg.id === requestBody.targetMessageId)
          if (!targetMessage) {
            return notFound('Target message not found')
          }
        }
        history = flatten(messages, requestBody.targetMessageId ?? undefined)
      }

      const files = await assistantVersionFiles(assistantVersion.id)
      const availableTools = await availableToolsForAssistantVersion(
        assistantVersion.id,
        assistantVersion.model
      )
      const result = await estimateInputTokens({
        assistantParams: {
          assistantId,
          model: assistantVersion.model,
          reasoning_effort: assistantVersion.reasoning_effort,
          systemPrompt: assistantVersion.systemPrompt,
          temperature: assistantVersion.temperature,
          tokenLimit: assistantVersion.tokenLimit,
        },
        model,
        tools: availableTools,
        parameters: await getUserParameters(session.userId),
        knowledgeFiles: files,
        history,
        draftText: requestBody.draftText,
        attachmentFileIds: requestBody.attachmentFileIds,
      })
      return ok({
        assistantId,
        model: model.id,
        tokenizer: tokenizerForModel(model),
        estimate: result.estimate,
      })
    },
  }),
})
