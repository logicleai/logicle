import {
  ToolImplementation,
  ToolBuilder,
  ToolParams,
  ToolFunctions,
  ToolFunctionContext,
} from '@/lib/chat/tools'
import {
  FileManagerPluginInterface,
  FileManagerPluginParams,
} from '@/lib/tools/schemas'
import { db } from '@/db/database'
import * as dto from '@/types/dto'
import { LlmModel } from '@/lib/chat/models'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { storage } from '@/lib/storage'
import type { FileDbRow } from '@/backend/models/file'

export class FileManagerPlugin extends FileManagerPluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new FileManagerPlugin(toolParams, params as FileManagerPluginParams) // TODO: need a better validation
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    public params: FileManagerPluginParams
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context?: ToolFunctionContext) => this.functions_

  functions_: ToolFunctions = {
    getFile: {
      description: 'Get the content of an uploaded file in base64 format',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'name of the file',
          },
        },
        additionalProperties: false,
        required: ['name'],
      },
      invoke: async ({ params }): Promise<dto.ToolCallResultOutput> => {
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
          .where('name', '=', `${params.name}`)
          .executeTakeFirst() as FileDbRow | undefined
        if (!fileEntry) {
          return {
            type: 'error-text',
            value: 'File not found',
          }
        }
        return {
          type: 'content',
          value: [
            {
              type: 'file',
              id: fileEntry.id,
              size: fileEntry.size ?? 0,
              name: fileEntry.name,
              mimetype: fileEntry.type,
            },
          ],
        }
      },
    },
    read_file: {
      description:
        'Read file content on-demand by file id. Returns extracted text when available, otherwise base64 bytes.',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'file id',
          },
        },
        additionalProperties: false,
        required: ['id'],
      },
      invoke: async ({ params }): Promise<dto.ToolCallResultOutput> => {
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
          .where('id', '=', `${params.id}`)
          .executeTakeFirst() as FileDbRow | undefined
        if (!fileEntry) {
          return {
            type: 'error-text',
            value: 'File not found',
          }
        }
        const extractedText = await cachingExtractor.extractFromFile(fileEntry)
        if (typeof extractedText === 'string' && extractedText.length > 0) {
          return {
            type: 'text',
            value: extractedText,
          }
        }
        const bytes = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
        return {
          type: 'text',
          value: bytes.toString('base64'),
        }
      },
    },
  }
}
