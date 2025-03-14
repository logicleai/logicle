import { createFolder, getFolders } from '@/models/folder'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'
export const dynamic = 'force-dynamic'

// Fetch folders
export const GET = requireSession(async (session) => {
  const folders = await getFolders(session.userId)
  return ApiResponses.json(folders)
})

export const POST = requireSession(async (session, req) => {
  const creationRequest = (await req.json()) as dto.InsertableConversationFolder
  if (creationRequest.ownerId !== session.userId) {
    return ApiResponses.invalidParameter("Can't create folders for other users")
  }
  const folder = await createFolder(creationRequest)
  return ApiResponses.created(folder)
})
