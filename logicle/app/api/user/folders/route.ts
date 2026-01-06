import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { createFolder, getFolders } from '@/models/folder'
import { conversationFolderSchema, insertableConversationFolderSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List user folders',
    description: 'Fetch conversation folders for the current user.',
    authentication: 'user',
    responseBodySchema: conversationFolderSchema.array(),
    implementation: async (_req: Request, _params, { session }) => {
      return await getFolders(session.userId)
    },
  }),
  POST: operation({
    name: 'Create user folder',
    description: 'Create a conversation folder for the current user.',
    authentication: 'user',
    requestBodySchema: insertableConversationFolderSchema,
    responseBodySchema: conversationFolderSchema,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const folder = await createFolder(session.userId, requestBody)
      return ApiResponses.created(folder)
    },
  }),
})
