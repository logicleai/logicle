import { splitDataUri } from '@/lib/uris'
import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import * as schema from '@/db/schema'

export const getImage = async (imageId: string): Promise<schema.Image> => {
  return await db
    .selectFrom('Image')
    .selectAll()
    .where('Image.id', '=', imageId)
    .executeTakeFirstOrThrow()
}

export const existsImage = async (imageId: string): Promise<Boolean> => {
  const result = await db
    .selectFrom('Image')
    .select((eb) =>
      eb.exists(db.selectFrom('Image').select('id').where('Image.id', '=', imageId)).as('exists')
    )
    .executeTakeFirstOrThrow()
  return result.exists === true
}

export const createImageFromDataUri = async (dataUri: string) => {
  return createImageFromDataUriWithId(nanoid(), dataUri)
}

export const createImageFromDataUriWithId = async (id: string, dataUri: string) => {
  const { data, mimeType } = splitDataUri(dataUri)
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
