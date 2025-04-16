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
  const folder = await createFolder(session.userId, creationRequest)
  return ApiResponses.created(folder)
})
