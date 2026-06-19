import { db } from 'db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'

export function parseApiKeyScope(scope: string | null): dto.ApiKeyScope | null {
  if (!scope) {
    return null
  }

  try {
    return dto.apiKeyScopeSchema.parse(JSON.parse(scope))
  } catch {
    return null
  }
}

function serializeApiKeyScope(scope?: dto.ApiKeyScope | null): string | null {
  if (!scope) {
    return null
  }

  return JSON.stringify(scope)
}

function dbToDto(apiKey: schema.ApiKey) {
  return {
    ...apiKey,
    provisioned: !!apiKey.provisioned,
    scope: parseApiKeyScope(apiKey.scope),
  }
}

export const getApiKey = async (id: string): Promise<dto.ApiKey | undefined> => {
  const result = await db.selectFrom('ApiKey').selectAll().where('id', '=', id).executeTakeFirst()
  return result ? dbToDto(result) : undefined
}

export const getUserApiKey = async (userId: string, apiKeyId: string) => {
  return await db
    .selectFrom('ApiKey')
    .selectAll()
    .where('userId', '=', userId)
    .where('id', '=', apiKeyId)
    .executeTakeFirst()
}

export const getUserApiKeys = async (userId: string): Promise<dto.ApiKey[]> => {
  const result = await db.selectFrom('ApiKey').selectAll().where('userId', '=', userId).execute()
  return result.map(dbToDto)
}

export const deleteApiKey = async (userId: string, id: string) => {
  return await db.deleteFrom('ApiKey').where('id', '=', id).where('userId', '=', userId).execute()
}

export const createApiKey = async (userId: string, key: string, data: dto.InsertableUserApiKey) => {
  return await createApiKeyWithId(nanoid(), key, { userId: userId, ...data }, false)
}
export const createApiKeyWithId = async (
  id: string,
  key: string,
  apiKey: dto.InsertableApiKey,
  provisioned: boolean,
  scope?: dto.ApiKeyScope | null
) => {
  await db
    .insertInto('ApiKey')
    .values({
      ...apiKey,
      key,
      id: id,
      enabled: 1,
      createdAt: new Date().toISOString(),
      provisioned: provisioned ? 1 : 0,
      scope: serializeApiKeyScope(scope),
    })
    .executeTakeFirstOrThrow()
  const created = await getApiKey(id)
  if (!created) {
    throw new Error('Failed creating api key')
  }
  return created
}

export const updateApiKey = async (
  id: string,
  key: string | undefined,
  data: Partial<dto.InsertableApiKey>
) => {
  const apiKey = await getApiKey(id)
  if (!apiKey) {
    throw new Error('Backend not found')
  }
  return db
    .updateTable('ApiKey')
    .set({
      ...data,
      key,
      id: undefined,
      provisioned: undefined, // protect against malicious API usage
      scope: data.scope === undefined ? undefined : serializeApiKeyScope(data.scope),
    })
    .where('id', '=', id)
    .execute()
}
