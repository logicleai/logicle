import { ToolImplementation, ToolBuilder, ToolParams, ToolFunctions } from '@/lib/chat/tools'
import { KnowledgePluginInterface, KnowledgePluginParams } from './interface'
import { db } from '@/db/database'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider'
import { storage } from '@/lib/storage'
import env from '@/lib/env'
import * as dto from '@/types/dto'
import { logger } from '@/lib/logging'
import * as ai from 'ai'
import { LlmModel } from '@/lib/chat/models'
import {
  acceptableImageTypes,
  loadFilePartFromFileEntry,
  loadImagePartFromFileEntry,
} from '@/lib/chat/conversion'

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

  functions = async () => this.functions_

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
      invoke: async ({ llmModel, params }): Promise<LanguageModelV2ToolResultOutput> => {
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
          const data = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
          return {
            type: 'content',
            value: [
              {
                type: 'media',
                mediaType: fileEntry.type,
                data: data.toString('base64'),
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
      throw new Error("Can't find knowledge file")
    }
    if (llmModel.capabilities.vision && acceptableImageTypes.includes(fileEntry.type)) {
      return loadImagePartFromFileEntry(fileEntry)
    }
    if (llmModel.capabilities.supportedMedia?.includes(fileEntry.type)) {
      return loadFilePartFromFileEntry(fileEntry)
    }
    const text = await cachingExtractor.extractFromFile(fileEntry)
    if (text) {
      return {
        type: 'text',
        text: `Here is the text content of the file "${fileEntry.name}" with id ${fileEntry.id}\n${text}`,
      } satisfies ai.TextPart
    }
    return {
      type: 'text',
      text: `The content of the file "${fileEntry.name}" with id ${fileEntry.id} could not be extracted. It is possible that some tools can return the content on demand`,
    } satisfies ai.TextPart
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
