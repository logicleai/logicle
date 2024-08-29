import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { getModels } from '@/lib/openai/models'

export const getBackends = async () => {
  return db.selectFrom('Backend').selectAll().execute()
}

export const getBackend = async (backendId: dto.Backend['id']) => {
  return db.selectFrom('Backend').selectAll().where('id', '=', backendId).executeTakeFirst()
}

export const createBackend = async (backend: dto.InsertableBackend) => {
  const id = nanoid()
  await db
    .insertInto('Backend')
    .values({
      ...backend,
      id: id,
    })
    .executeTakeFirstOrThrow()
  const created = await getBackend(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateBackend = async (id: string, data: object) => {
  if (Object.keys(data).length == 0) return []
  return db.updateTable('Backend').set(data).where('id', '=', id).execute()
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
