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

export class SubAssistantTool implements ToolImplementation {
  supportedMedia: string[] = ['text/plain', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']

  constructor(
    public toolParams: ToolParams,
    private childAssistantId: string,
    private childName: string,
    private childDescription: string
  ) {}

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    const childAssistantId = this.childAssistantId
    const childName = this.childName
    const childDescription = this.childDescription

    const safeName = childName.replace(/[^a-zA-Z0-9_]/g, '_')

    return {
      [safeName]: {
        description: childDescription || `Invoke the ${childName} assistant`,
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: `The input message to send to the ${childName} assistant`,
            },
          },
          required: ['input'],
          additionalProperties: false,
        },
        requireConfirm: false,
        invoke: async ({ params }) => {
          const input = params.input as string
          try {
            const assistantVersion = await getPublishedAssistantVersion(childAssistantId)
            if (!assistantVersion) {
              return {
                type: 'error-text',
                value: `Sub-assistant "${childName}" has no published version`,
              }
            }

            const rawBackend = await db
              .selectFrom('Backend')
              .selectAll()
              .where('id', '=', assistantVersion.backendId)
              .executeTakeFirst()

            if (!rawBackend) {
              return {
                type: 'error-text',
                value: `Sub-assistant "${childName}" backend not found`,
              }
            }

            const providerConfig = {
              providerType: rawBackend.providerType,
              provisioned: !!rawBackend.provisioned,
              ...JSON.parse(rawBackend.configuration),
            }

            const llmModel = llmModels.find(
              (m) =>
                m.id === assistantVersion.model && m.provider === providerConfig.providerType
            )
            if (!llmModel) {
              return {
                type: 'error-text',
                value: `Sub-assistant "${childName}" model ${assistantVersion.model} not found`,
              }
            }

            const languageModel = ChatAssistant.createLanguageModel(providerConfig, llmModel)

            const messages: ai.ModelMessage[] = [
              {
                role: 'system',
                content: assistantVersion.systemPrompt,
              },
              {
                role: 'user',
                content: input,
              },
            ]

            const result = ai.streamText({
              model: languageModel,
              messages,
              temperature: assistantVersion.temperature,
            })

            let text = ''
            for await (const chunk of result.textStream) {
              text += chunk
            }

            return { type: 'text', value: text }
          } catch (e) {
            logger.error(`SubAssistantTool: error invoking child assistant "${childName}"`, e)
            return {
              type: 'error-text',
              value: (e as Error).message ?? 'Sub-assistant invocation failed',
            }
          }
        },
      },
    }
  }
}
