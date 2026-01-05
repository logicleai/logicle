import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import * as dto from '@/types/dto'
import { addFile } from '@/models/file'
import env from '@/lib/env'

export const POST = requireSession(async (_session, req) => {
  const result = dto.insertableFileSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const id = nanoid()
  const file = result.data
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  const created = await addFile(file, path, env.fileStorage.encryptFiles)
  return ApiResponses.created(created)
})
