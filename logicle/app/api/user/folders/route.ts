import { createFolder, getFolders } from 'models/folder' // Import the helper functions
import ApiResponses from '@/api/utils/ApiResponses'
import { InsertableConversationFolder } from '@/types/dto'
import { requireSession } from '../../utils/auth'
export const dynamic = 'force-dynamic'

// Fetch folders
export const GET = requireSession(async (session) => {
  const folders = await getFolders(session.user.id)
  return ApiResponses.json(folders)
})

export const POST = requireSession(async (session, req) => {
  const creationRequest = (await req.json()) as InsertableConversationFolder
  if (creationRequest.ownerId !== session.user.id) {
    return ApiResponses.invalidParameter("Can't create folders for other users")
  }
  const folder = await createFolder(creationRequest)
  return ApiResponses.created(folder)
})
