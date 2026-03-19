import { ok, operation, responseSpec } from '@/lib/routes'
import { createFolder, getFolders } from '@/models/folder'
import { conversationFolderSchema, insertableConversationFolderSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List user folders',
  description: 'Fetch conversation folders for the current user.',
  authentication: 'user',
  responses: [responseSpec(200, conversationFolderSchema.array())] as const,
  implementation: async ({ session }) => {
    return ok(await getFolders(session.userId))
  },
})

export const POST = operation({
  name: 'Create user folder',
  description: 'Create a conversation folder for the current user.',
  authentication: 'user',
  requestBodySchema: insertableConversationFolderSchema,
  responses: [responseSpec(201, conversationFolderSchema)] as const,
  implementation: async ({ session, body }) => {
    const folder = await createFolder(session.userId, body)
    return ok(folder, 201)
  },
})
