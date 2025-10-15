import { ToolImplementation, ToolBuilder, ToolParams, ToolFunctions } from '@/lib/chat/tools'
import { KnowledgePluginInterface, KnowledgePluginParams } from './interface'
import { db } from '@/db/database'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider'
import { storage } from '@/lib/storage'
import env from '@/lib/env'

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
}
