import { ToolImplementation, ToolBuilder, ToolParams, ToolFunctions } from '@/lib/chat/tools'
import { KnowledgePluginInterface, KnowledgePluginParams } from './interface'
import { db } from '@/db/database'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider'
import { storage } from '@/lib/storage'
import env from '@/lib/env'
import * as dto from '@/types/dto'

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

  async extractKnowledgeText(knowledgeFile: dto.AssistantFile) {
    const fileEntry = await db
      .selectFrom('File')
      .selectAll()
      .where('id', '=', `${knowledgeFile.id}`)
      .executeTakeFirst()
    if (!fileEntry) {
      throw new Error("Can't find knowledge file")
    }
    const text = await cachingExtractor.extractFromFile(fileEntry)
    if (!text) {
      return undefined
    }
    return `Here is the content of ${knowledgeFile}:\n${text}\n`
  }

  async systemPrompt(knowledge: dto.AssistantFile[]): Promise<string> {
    if (knowledge.length === 0) return ''
    const knowledgePrompt = `
      More files are available as assistant knowledge.
      These files can be retrieved or processed by function calls referring to their id.
      Here is the assistant knowledge:
      ${JSON.stringify(knowledge)}
      When the user requests to gather information from unspecified files, he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.
      `
    if (env.knowledge.sendInSystemPrompt) {
      const texts = await Promise.all(knowledge.map((k) => this.extractKnowledgeText(k)))
      const nonEmpty = texts.filter((t) => t !== undefined)
      return [knowledgePrompt, ...nonEmpty].join()
    }
    return knowledgePrompt
  }
}
