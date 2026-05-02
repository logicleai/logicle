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
          .selectAll()
          .where('name', '=', `${params.name}`)
          .executeTakeFirst()
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
              size: fileEntry.size,
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
        const fileEntry = await db.selectFrom('File').selectAll().where('id', '=', `${params.id}`).executeTakeFirst()
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
