import { db } from 'db/database'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'
import { getModels } from '@/lib/chat/models'

export const dtoBackendFromSchemaBackend = (backend: schema.Backend) => {
  return {
    ...backend,
    ...JSON.parse(backend.configuration),
    configuration: undefined,
  } as dto.Backend
}

export const getBackends = async (): Promise<dto.Backend[]> => {
  return (await db.selectFrom('Backend').selectAll().execute()).map(dtoBackendFromSchemaBackend)
}

const getBackendRaw = async (backendId: dto.Backend['id']): Promise<schema.Backend | undefined> => {
  return await db.selectFrom('Backend').selectAll().where('id', '=', backendId).executeTakeFirst()
}

export const getBackend = async (
  backendId: dto.Backend['id']
): Promise<dto.Backend | undefined> => {
  const dbResult = await getBackendRaw(backendId)
  return dbResult ? dtoBackendFromSchemaBackend(dbResult) : undefined
}

export const createBackend = async (backend: dto.InsertableBackend) => {
  const id = nanoid()
  const { name, providerType, modelDetection, ...configuration } = backend
  await db
    .insertInto('Backend')
    .values({
      id: id,
      name,
      providerType,
      modelDetection,
      configuration: JSON.stringify(configuration),
    })
    .executeTakeFirstOrThrow()
  const created = await getBackend(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateBackend = async (id: string, data: Partial<dto.InsertableBackend>) => {
  const { name, providerType, modelDetection, ...configuration } = data
  const backend = await getBackendRaw(id)
  if (!backend) {
    throw new Error('Backend not found')
  }
  if (Object.keys(data).length == 0) return []
  return db
    .updateTable('Backend')
    .set({
      name,
      providerType,
      modelDetection,
      configuration: JSON.stringify({
        ...JSON.parse(backend.configuration),
        ...configuration,
      }),
    })
    .where('id', '=', id)
    .execute()
}

export const deleteBackend = async (backendId: dto.Backend['id']) => {
  return db.deleteFrom('Backend').where('id', '=', backendId).executeTakeFirstOrThrow()
}

export const getBackendsWithModels = async (): Promise<dto.BackendModels[]> => {
  const backends = await getBackends()
  const result: dto.BackendModels[] = []
  for (const backend of backends) {
    result.push({
      backendId: backend.id,
      backendName: backend.name,
      models: getModels(backend.providerType),
    })
  }
  return result
}
