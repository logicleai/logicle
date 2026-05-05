import {
  ToolImplementation,
  ToolBuilder,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
} from '@/lib/chat/tools'
import {
  KnowledgePluginInterface,
  KnowledgePluginParams,
} from '@/lib/tools/schemas'
import { db } from '@/db/database'
import env from '@/lib/env'
import * as dto from '@/types/dto'
import * as ai from 'ai'
import { LlmModel } from '@/lib/chat/models'
import { dtoFileToLlmFilePart } from '@/backend/lib/chat/conversion'
import { cachingExtractor } from '@/lib/textextraction/cache'
import type { FileDbRow } from '@/backend/models/file'

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
          .leftJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
          .select([
            'File.id as id',
            'File.name as name',
            'File.ownerType as ownerType',
            'File.ownerId as ownerId',
            'File.path as path',
            'File.type as type',
            'File.createdAt as createdAt',
            'File.fileBlobId as fileBlobId',
            'FileBlob.size as size',
            'FileBlob.encrypted as encrypted',
          ])
          .where('File.id', '=', `${params.id}`)
          .executeTakeFirst() as FileDbRow | undefined
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
                size: fileEntry.size ?? 0,
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
      .leftJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
      .select([
        'File.id as id',
        'File.name as name',
        'File.ownerType as ownerType',
        'File.ownerId as ownerId',
        'File.path as path',
        'File.type as type',
        'File.createdAt as createdAt',
        'File.fileBlobId as fileBlobId',
        'FileBlob.size as size',
        'FileBlob.encrypted as encrypted',
      ])
      .where('File.id', '=', `${knowledgeFile.id}`)
      .executeTakeFirst() as FileDbRow | undefined
    if (!fileEntry) {
      return {
        type: 'text',
        text: `The knowledge file with id ${knowledgeFile.id} could not be found.`,
      } satisfies ai.TextPart
    }
    return dtoFileToLlmFilePart(fileEntry, llmModel.capabilities)
  }

}
