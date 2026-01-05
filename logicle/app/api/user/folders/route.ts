import { createFolder, getFolders } from '@/models/folder'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'
import { insertableConversationFolderSchema } from '@/types/dto'
export const dynamic = 'force-dynamic'

// Fetch folders
export const GET = requireSession(async (session) => {
  const folders = await getFolders(session.userId)
  return ApiResponses.json(folders)
})

export const POST = requireSession(async (session, req) => {
  const result = insertableConversationFolderSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const folder = await createFolder(session.userId, result.data)
  return ApiResponses.created(folder)
})
