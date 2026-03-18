import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

export const getFileWithId = async (id: string): Promise<schema.File | undefined> => {
  return await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
}

export const addFile = async (file: dto.InsertableFile, path: string, encrypted: boolean) => {
  const id = nanoid()
  await db
    .insertInto('File')
    .values({
      ...file,
      id,
      path: path,
      createdAt: new Date().toISOString(),
      uploaded: 0,
      encrypted: encrypted ? 1 : 0,
    })
    .execute()
  const created = await getFileWithId(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}
