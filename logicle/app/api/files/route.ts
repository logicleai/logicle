import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import { db } from '@/db/database'
import { InsertableFile } from '@/types/db'

export const POST = requireSession(async (session, req) => {
  const id = nanoid()
  const file = (await req.json()) as InsertableFile
  const path = `${id}-${file.name.replace(/(\W+)/gi, '-')}`
  await db
    .insertInto('File')
    .values({
      ...file,
      id,
      path: path,
      createdAt: new Date().toISOString(),
      uploaded: 0,
    })
    .execute()
  return ApiResponses.created(
    await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
  )
})
