import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import * as dto from '@/types/dto'
import { addFile } from '@/models/file'
import { addAssistantFile } from '@/models/assistant'
import env from '@/lib/env'

export const POST = requireSession(async (session, req) => {
  const id = nanoid()
  const file = (await req.json()) as dto.InsertableFile
  const assistantId = req.nextUrl.searchParams.get('assistantId')
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  const created = await addFile(file, path, env.fileStorage.encryptFiles)
  if (assistantId) {
    await addAssistantFile(assistantId, created)
  }
  return ApiResponses.created(created)
})
