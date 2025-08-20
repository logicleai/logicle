import { ToolImplementation, ToolBuilder, ToolParams, ToolFunctions } from '@/lib/chat/tools'
import { FileManagerPluginInterface, FileManagerPluginParams } from './interface'
import { db } from '@/db/database'
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

  functions = async () => this.functions_

  functions_: ToolFunctions = {
    GetFile: {
      description: 'Get the content of an uploaded file in base64 format',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the file',
          },
        },
        additionalProperties: false,
        required: ['name'],
      },
      invoke: async ({ params }) => {
        const fileEntry = await db
          .selectFrom('File')
          .selectAll()
          .where('name', '=', '' + params['name'])
          .executeTakeFirst()
        if (!fileEntry) {
          return 'File not found'
        }
        const fileContent = await storage.readBuffer(
          fileEntry.path,
          fileEntry.encrypted ? true : false
        )
        return `data:${fileEntry.type};base64,${fileContent.toString('base64')}`
      },
    },
  }
}
