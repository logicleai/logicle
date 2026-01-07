import env from '@/lib/env'
import { forbidden, notFound, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { getConversationsWithFolder } from '@/models/conversation'
import { getFolder } from '@/models/folder'
import { ConversationWithFolderSchema } from '@/types/dto/chat'

export const dynamic = 'force-dynamic'

// Fetch all conversations
export const { GET } = route({
  GET: operation({
    name: 'List folder conversations',
    description: 'Fetch conversations inside a folder for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, ConversationWithFolderSchema.array()), errorSpec(403), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { folderId: string }, { session }) => {
      const folder = await getFolder(params.folderId)
      if (!folder) {
        return notFound()
      }
      if (folder?.ownerId !== session.userId) {
        return forbidden('Not the owner of this folder')
      }
      const conversations = await getConversationsWithFolder({
        folderId: params.folderId,
        limit: env.conversationLimit,
      })
      return ok(conversations)
    },
  }),
})
