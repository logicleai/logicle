import {
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import * as ai from 'ai'
import { ChatAssistant } from '@/backend/lib/chat'
import { getPublishedAssistantVersion } from '@/models/assistant'
import { db } from 'db/database'
import { logger } from '@/lib/logging'
import { llmModels } from '@/lib/models'

export interface SubAssistantEntry {
  id: string
  name: string
  description: string
}

export class SubAssistantTool implements ToolImplementation {
  supportedMedia: string[] = ['text/plain', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

  constructor(
    public toolParams: ToolParams,
    private assistants: SubAssistantEntry[]
  ) {}

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    const assistants = this.assistants
    return {
      invoke_assistant: {
        description: 'Invoke a sub-assistant by its id.',
        parameters: {
          type: 'object',
          properties: {
            assistantId: {
              type: 'string',
              enum: assistants.map((a) => a.id),
              description: 'The ID of the assistant to invoke',
            },
            input: {
              type: 'string',
              description: 'The input message to send to the assistant',
            },
          },
          required: ['assistantId', 'input'],
          additionalProperties: false,
        },
        requireConfirm: false,
        invoke: async ({ params }) => {
          const assistantId = params.assistantId as string
          const input = params.input as string
          const entry = assistants.find((a) => a.id === assistantId)
          const label = entry?.name ?? assistantId
          try {
            const assistantVersion = await getPublishedAssistantVersion(assistantId)
            if (!assistantVersion) {
              return { type: 'error-text', value: `Sub-assistant "${label}" has no published version` }
            }

            const rawBackend = await db
              .selectFrom('Backend')
              .selectAll()
              .where('id', '=', assistantVersion.backendId)
              .executeTakeFirst()

            if (!rawBackend) {
              return { type: 'error-text', value: `Sub-assistant "${label}" backend not found` }
            }

            const providerConfig = {
              providerType: rawBackend.providerType,
              provisioned: !!rawBackend.provisioned,
              ...JSON.parse(rawBackend.configuration),
            }

            const llmModel = llmModels.find(
              (m) => m.id === assistantVersion.model && m.provider === providerConfig.providerType
            )
            if (!llmModel) {
              return {
                type: 'error-text',
                value: `Sub-assistant "${label}" model ${assistantVersion.model} not found`,
              }
            }

            const languageModel = ChatAssistant.createLanguageModel(providerConfig, llmModel)

            const messages: ai.ModelMessage[] = [
              { role: 'system', content: assistantVersion.systemPrompt },
              { role: 'user', content: input },
            ]

            const result = ai.streamText({ model: languageModel, messages, temperature: assistantVersion.temperature })

            let text = ''
            for await (const chunk of result.textStream) {
              text += chunk
            }

            return { type: 'text', value: text }
          } catch (e) {
            logger.error(`SubAssistantTool: error invoking "${label}"`, e)
            return { type: 'error-text', value: (e as Error).message ?? 'Sub-assistant invocation failed' }
          }
        },
      },
    }
  }
}
