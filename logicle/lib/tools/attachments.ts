import { MessageDTO } from '@/types/chat'
import { ToolImplementation } from '../openai'
import { db } from '@/db/database'
import fs from 'fs'

export const attachmentTool: ToolImplementation = {
  functions: [
    {
      function: {
        name: 'attachments',
        description: 'Returns the name of the attached documents',
      },
      invoke: async (messages: MessageDTO[]) => {
        return messages
          .flatMap((m) => m.attachments)
          .map((a) => a.name)
          .join(',')
      },
    },
    {
      function: {
        name: 'attachmentContent',
        description: 'Returns the content of a previously attached document',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the document',
            },
          },
          required: ['name'],
        },
      },
      invoke: async (messages: MessageDTO[], params: Record<string, any>) => {
        const file = await db
          .selectFrom('File')
          .select('path')
          .where('name', '=', params['name'])
          .executeTakeFirst()
        if (!file) {
          throw new Error('No such file')
        }
        const fileStorageLocation = process.env.FILE_STORAGE_LOCATION
        const fileContent = await fs.promises.readFile(`${fileStorageLocation}/${file.path}`)
        if (!fileContent) {
          throw new Error('Unreadable content')
        }
        return fileContent.toString('utf8')
      },
    },
  ],
}
