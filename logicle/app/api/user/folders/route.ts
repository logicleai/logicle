import { ok, operation, responseSpec, route } from '@/lib/routes'
import { createFolder, getFolders } from '@/models/folder'
import { conversationFolderSchema, insertableConversationFolderSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List user folders',
    description: 'Fetch conversation folders for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, conversationFolderSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      return ok(await getFolders(session.userId))
    },
  }),
  POST: operation({
    name: 'Create user folder',
    description: 'Create a conversation folder for the current user.',
    authentication: 'user',
    requestBodySchema: insertableConversationFolderSchema,
    responses: [responseSpec(201, conversationFolderSchema)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const folder = await createFolder(session.userId, requestBody)
      return ok(folder, 201)
    },
  }),
})
