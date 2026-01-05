import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import { addFile } from '@/models/file'
import { addAssistantFile } from '@/models/assistant'
import env from '@/lib/env'
import { insertableFileSchema } from '@/types/dto/file'

export const POST = requireSession(async (_session, req) => {
  const id = nanoid()
  const result = insertableFileSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const file = result.data
  const assistantId = req.nextUrl.searchParams.get('assistantId')
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  const created = await addFile(file, path, env.fileStorage.encryptFiles)
  if (assistantId) {
    await addAssistantFile(assistantId, created)
  }
  return ApiResponses.created(created)
})
