import { splitDataUri } from '@/lib/uris'
import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import { Selectable } from 'kysely'
import * as schema from '@/db/schema'

export const getImage = async (imageId: string): Promise<Selectable<schema.Image>> => {
  return await db
    .selectFrom('Image')
    .selectAll()
    .where('Image.id', '=', imageId)
    .executeTakeFirstOrThrow()
}

export const createImageFromDataUri = async (dataUri: string) => {
  const { data, mimeType } = splitDataUri(dataUri)
  const id = nanoid()
  const values = {
    id,
    data,
    mimeType,
  }
  await db.insertInto('Image').values(values).execute()
  return values
}

export const createImageFromDataUriIfNotNull = async (dataUri: string | null) => {
  if (!dataUri) return null
  return await createImageFromDataUri(dataUri)
}
