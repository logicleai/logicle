import { ToolImplementation, ToolBuilder, ToolParams, ToolFunctions } from '@/lib/chat/tools'
import { FileManagerPluginInterface, FileManagerPluginParams } from './interface'
import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import * as dto from '@/types/dto'

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

  functions = async () => this.functions_

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
        const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
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
  }
}
