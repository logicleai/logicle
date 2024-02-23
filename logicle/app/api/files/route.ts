import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import { InsertableFile } from '@/types/db'
import { addFile } from 'models/file'
import { db } from '@/db/database'

export const POST = requireSession(async (session, req) => {
  const id = nanoid()
  const file = (await req.json()) as InsertableFile
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  const created = await addFile(id, file, path)
  db.insertInto('AssistantFile')
    .values({
      id: nanoid(),
      assistantId: nanoid(),
      fileId: created.id,
    })
    .executeTakeFirst()
  return ApiResponses.created(created)
})
