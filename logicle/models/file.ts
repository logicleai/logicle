import { InsertableFile } from '@/types/dto'
import { db } from 'db/database'

export const getFileWithId = async (id: string) => {
  return await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
}

export const addFile = async (id: string, file: InsertableFile, path: string) => {
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
  const created = await getFileWithId(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}
