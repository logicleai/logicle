import {
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import { AssistantParams, ChatAssistant } from '@/backend/lib/chat'
import {
  canUserAccessAssistant,
  getPublishedAssistantVersion,
  assistantVersionFiles,
} from '@/models/assistant'
import { db } from 'db/database'
import { logger } from '@/lib/logging'
import { availableToolsForAssistantVersion } from '@/backend/lib/tools/enumerate'
import { getUserParameters } from '@/lib/parameters'
import { ChatState } from '@/backend/lib/chat/ChatState'
import { ClientSink } from '@/backend/lib/chat/ClientSink'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export interface SubAssistantEntry {
  id: string
  name: string
  description: string
}

const nullSink: ClientSink = { enqueue: () => {} }

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
        invoke: async ({ params, userId, conversationId, rootOwner }) => {
          const assistantId = params.assistantId as string
          const input = params.input as string
          const entry = assistants.find((a) => a.id === assistantId)
          const label = entry?.name ?? assistantId
          try {
            if (!userId || !(await canUserAccessAssistant(userId, assistantId))) {
              return { type: 'error-text', value: `Access to sub-assistant "${label}" is denied` }
            }

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

            const [tools, files, parameters] = await Promise.all([
              availableToolsForAssistantVersion(assistantVersion.id, assistantVersion.model),
              assistantVersionFiles(assistantVersion.id),
              userId ? getUserParameters(userId) : Promise.resolve({}),
            ])

            const assistantParams: AssistantParams = {
              assistantId,
              model: assistantVersion.model,
              systemPrompt: assistantVersion.systemPrompt,
              temperature: assistantVersion.temperature,
              tokenLimit: assistantVersion.tokenLimit,
              reasoning_effort: assistantVersion.reasoning_effort as
                | 'low'
                | 'medium'
                | 'high'
                | null,
            }

            const assistant = await ChatAssistant.build(providerConfig, assistantParams, parameters, tools, files, {
              user: userId,
              conversationId,
              rootOwner,
            })

            const subConversationId = nanoid()
            const userMsg: dto.UserMessage = {
              id: nanoid(),
              conversationId: subConversationId,
              parent: null,
              sentAt: new Date().toISOString(),
              role: 'user',
              content: input,
              attachments: [],
            }

            const chatState = new ChatState([userMsg])
            await assistant.invokeLlmAndProcessResponse(chatState, nullSink)

            const lastMsg = chatState.getLastMessage()
            if (!lastMsg || lastMsg.role !== 'assistant') {
              return { type: 'error-text', value: 'Sub-assistant did not produce a response' }
            }
            const assistantMsg = lastMsg as dto.AssistantMessage
            const errorPart = assistantMsg.parts.find(
              (p): p is dto.ErrorPart => p.type === 'error'
            )
            if (errorPart) {
              return { type: 'error-text', value: errorPart.error }
            }
            const text = assistantMsg.parts
              .filter((p): p is dto.TextPart => p.type === 'text')
              .map((p) => p.text)
              .join('')
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
