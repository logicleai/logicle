import { splitDataUri, toDataUri } from '@/lib/uris'
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
  const aa = await db
    .selectFrom('Image')
    .select('Image.id')
    .where('Image.id', '=', imageId)
    .executeTakeFirst()
  return aa != undefined
}

async function nanoIdFromHash(input: string, size = 21) {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  let id = ''
  for (let i = 0; i < size; i++) {
    const index = hashArray[i % hashArray.length] % alphabet.length
    id += alphabet[index]
  }
  return id
}

export const getImageAsDataUri = async (imageId: string): Promise<string> => {
  const image = await getImage(imageId)
  return toDataUri(image.data, image.mimeType)
}

export const getOrCreateImageFromDataUri = async (dataUri: string): Promise<string> => {
  const imageId = await nanoIdFromHash(dataUri)
  if (!(await existsImage(imageId))) {
    await createImageFromDataUriWithId(imageId, dataUri)
  }
  return imageId
}

const createImageFromDataUriWithId = async (id: string, dataUri: string) => {
  const { data, mimeType } = splitDataUri(dataUri)
  const values = {
    id,
    data,
    mimeType,
  }
  await db.insertInto('Image').values(values).execute()
  return values
}
