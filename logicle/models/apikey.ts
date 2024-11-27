import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const getApiKey = async (id: string) => {
  return await db.selectFrom('ApiKey').selectAll().where('id', '=', id).executeTakeFirst()
}

export const getUserApiKey = async (userId: string, apiKeyId: string) => {
  return await db
    .selectFrom('ApiKey')
    .selectAll()
    .where('userId', '=', userId)
    .where('id', '=', apiKeyId)
    .executeTakeFirst()
}

export const getUserApiKeys = async (userId: string) => {
  return await db.selectFrom('ApiKey').selectAll().where('userId', '=', userId).execute()
}

export const deleteApiKey = async (userId: string, id: string) => {
  return await db.deleteFrom('ApiKey').where('id', '=', id).where('userId', '=', userId).execute()
}

export const createApiKey = async (userId: string, description: string) => {
  return await createApiKeyWithId(
    nanoid(),
    {
      key: nanoid(),
      userId: userId,
      expiresAt: null,
      description: description,
    },
    false
  )
}
export const createApiKeyWithId = async (
  id: string,
  apiKey: dto.InsertableApiKey,
  provisioned: boolean
) => {
  await db
    .insertInto('ApiKey')
    .values({
      ...apiKey,
      id: id,
      enabled: 1,
      createdAt: new Date().toISOString(),
      provisioned: provisioned ? 1 : 0,
    })
    .executeTakeFirstOrThrow()
}

export const updateApiKey = async (id: string, data: Partial<dto.InsertableApiKey>) => {
  const apiKey = await getApiKey(id)
  if (!apiKey) {
    throw new Error('Backend not found')
  }
  return db
    .updateTable('ApiKey')
    .set({
      ...data,
      id: undefined,
      provisioned: undefined, // protect against malicious API usage
    })
    .where('id', '=', id)
    .execute()
}
