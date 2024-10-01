import { ToolImplementation, ToolFunction, ToolBuilder } from '../../chat'
import { FileManagerPluginInterface, FileManagerPluginParams } from './interface'
import { db } from '@/db/database'
import * as dto from '@/types/dto'
import fs from 'fs'

export interface Params {}

export class FileManagerPlugin extends FileManagerPluginInterface implements ToolImplementation {
  static builder: ToolBuilder = (params: Record<string, any>) =>
    new FileManagerPlugin(params as Params) // TODO: need a better validation
  params: FileManagerPluginParams
  constructor(params: Params) {
    super()
    this.params = {
      ...params,
    }
  }

  functions: Record<string, ToolFunction> = {
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
        required: ['name'],
      },
      invoke: async (messages: dto.Message[], assistantId: string, params: Record<string, any>) => {
        const fileEntry = await db
          .selectFrom('File')
          .selectAll()
          .where('name', '=', params['name'])
          .executeTakeFirst()
        if (!fileEntry) {
          return 'File not found'
        }
        const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
        const fileContent = await fs.promises.readFile(`${fileStorageLocation}/${fileEntry.path}`)
        return `data:${fileEntry.type};base64,${fileContent.toString('base64')}`
      },
    },
  }
}
