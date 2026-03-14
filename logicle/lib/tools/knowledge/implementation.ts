import {
  ToolImplementation,
  ToolBuilder,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
} from '@/lib/chat/tools'
import { KnowledgePluginInterface, KnowledgePluginParams } from './interface'
import { db } from '@/db/database'
import env from '@/lib/env'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import * as ai from 'ai'
import { LlmModel } from '@/lib/chat/models'
import { dtoFileToLlmFilePart } from '@/lib/chat/conversion'
import { cachingExtractor } from '@/lib/textextraction/cache'

export class KnowledgePlugin extends KnowledgePluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new KnowledgePlugin(toolParams, params as KnowledgePluginParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    public params: KnowledgePluginParams
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context?: ToolFunctionContext) => {
    if (env.knowledge.sendInPrompt) {
      return {}
    }
    return this.functions_
  }

  functions_: ToolFunctions = {
    GetFile: {
      description: 'Get the content of a knowledge file ',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The id of the file',
          },
        },
        additionalProperties: false,
        required: ['id'],
      },
      invoke: async ({ llmModel, params }): Promise<dto.ToolCallResultOutput> => {
        const fileEntry = await db
          .selectFrom('File')
          .selectAll()
          .where('id', '=', `${params.id}`)
          .executeTakeFirst()
        if (!fileEntry) {
          return { type: 'error-text', value: 'File not found' }
        }
        const supportedMedias = llmModel.capabilities.supportedMedia ?? []
        if (!env.knowledge.alwaysConvertToText && supportedMedias.includes('application/pdf')) {
          return {
            type: 'content',
            value: [
              {
                type: 'file',
                id: fileEntry.id,
                name: fileEntry.name,
                size: fileEntry.size,
                mimetype: fileEntry.type,
              },
            ],
          }
        }
        const text = await cachingExtractor.extractFromFile(fileEntry)
        if (text) {
          return { type: 'text', value: text }
        } else {
          return { type: 'error-text', value: 'Failed extracting the content of the file' }
        }
      },
    },
  }

  async knowledgeToInputPart(knowledgeFile: dto.AssistantFile, llmModel: LlmModel) {
    const fileEntry = await db
      .selectFrom('File')
      .selectAll()
      .where('id', '=', `${knowledgeFile.id}`)
      .executeTakeFirst()
    if (!fileEntry) {
      return {
        type: 'text',
        text: `The knowledge file with id ${knowledgeFile.id} could not be found.`,
      } satisfies ai.TextPart
    }
    return dtoFileToLlmFilePart(fileEntry, llmModel.capabilities)
  }

  async contributeToChat(
    messages: ai.ModelMessage[],
    knowledge: dto.AssistantFile[],
    llmModel: LlmModel
  ): Promise<ai.ModelMessage[]> {
    if (knowledge.length === 0 || !env.knowledge.sendInPrompt) {
      return messages
    }
    if (messages.length === 0) return messages
    const patchedList = [...messages]
    const systemPrompt = patchedList[0]
    if (systemPrompt.role !== 'system') {
      logger.error('First message is not a system message. Probably bad truncation')
      return messages
    }
    const knowledgePrompt = `
      More files are available as assistant knowledge.
      These files can be retrieved or processed by function calls referring to their id.
      Here is the assistant knowledge:
      ${JSON.stringify(knowledge)}
      When the user requests to gather information from unspecified files, he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.
      `
    const prependedMessages: ai.ModelMessage[] = [
      {
        ...systemPrompt,
        content: `${systemPrompt.content}${knowledgePrompt}`,
      },
    ]

    if (env.knowledge.sendInPrompt) {
      const parts = await Promise.all(knowledge.map((k) => this.knowledgeToInputPart(k, llmModel)))
      prependedMessages.push({ role: 'user', content: parts })
    }

    return [...prependedMessages, ...messages.slice(1)]
  }
}
