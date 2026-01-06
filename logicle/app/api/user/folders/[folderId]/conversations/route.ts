import ApiResponses from '@/api/utils/ApiResponses'
import env from '@/lib/env'
import { route, operation } from '@/lib/routes'
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
    responseBodySchema: ConversationWithFolderSchema.array(),
    implementation: async (_req: Request, params: { folderId: string }, { session }) => {
      const folder = await getFolder(params.folderId)
      if (!folder) {
        return ApiResponses.noSuchEntity()
      }
      if (folder?.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction('Not the owner of this folder')
      }
      const conversations = await getConversationsWithFolder({
        folderId: params.folderId,
        limit: env.conversationLimit,
      })
      return conversations
    },
  }),
})
