import { ToolImplementation } from '@/lib/chat/tools'
import { db } from '@/db/database'
import { storage } from '@/lib/storage'

export const attachmentTool: ToolImplementation = {
  functions: {
    attachments: {
      description: 'Returns the name of the attached documents',
      invoke: async ({ messages }) => {
        return messages
          .flatMap((m) => m.attachments)
          .map((a) => a.name)
          .join(',')
      },
    },
    attachmentContent: {
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
      invoke: async ({ params }) => {
        const file = await db
          .selectFrom('File')
          .select('path')
          .where('name', '=', params['name'])
          .executeTakeFirst()
        if (!file) {
          throw new Error('No such file')
        }
        const fileContent = await storage.readFile(file.path)
        if (!fileContent) {
          throw new Error('Unreadable content')
        }
        return fileContent.toString('utf8')
      },
    },
  },
}
