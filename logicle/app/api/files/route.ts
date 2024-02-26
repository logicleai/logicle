import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import { InsertableFile } from '@/types/dto'
import { addFile } from 'models/file'
import { db } from '@/db/database'

export const POST = requireSession(async (session, req) => {
  const id = nanoid()
  const file = (await req.json()) as InsertableFile
  const assistantId = req.nextUrl.searchParams.get('assistantId')
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  const created = await addFile(id, file, path)
  // TODO: handle conversation use case.
  if (assistantId) {
    db.insertInto('AssistantFile')
      .values({
        id: nanoid(),
        assistantId: nanoid(),
        fileId: created.id,
      })
      .executeTakeFirst()
  }
  return ApiResponses.created(created)
})
