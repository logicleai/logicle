import { db } from 'db/database'
import * as dto from '@/types/dto'

export const getApiKey = async (id: string) => {
  return await db.selectFrom('ApiKey').selectAll().where('id', '=', id).executeTakeFirst()
}

export const createApiKeyWithId = async (
  id: string,
  apiKey: dto.InsertableApiKey,
  provisioned: Boolean
) => {
  await db
    .insertInto('ApiKey')
    .values({
      ...apiKey,
      id: id,
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
