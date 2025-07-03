import { getConversationsWithFolder } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '@/api/utils/auth'
import env from '@/lib/env'
import { getFolder } from '@/models/folder'

export const dynamic = 'force-dynamic'

// Fetch all conversations
export const GET = requireSession(async (session, req, params: { folderId: string }) => {
  const folder = await getFolder(params.folderId)
  if (!folder) {
    return ApiResponses.noSuchEntity()
  }
  if (folder?.ownerId != session.userId) {
    return ApiResponses.forbiddenAction('Not the owner of this folder')
  }
  const conversations = await getConversationsWithFolder({
    folderId: params.folderId,
    limit: env.conversationLimit,
  })
  return ApiResponses.json(conversations)
})
