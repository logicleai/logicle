import { db } from 'db/database'
import { Backend, InsertableBackend } from '@/types/db'
import { nanoid } from 'nanoid'

export const getBackends = async () => {
  return db.selectFrom('Backend').selectAll().execute()
}

export const getBackend = async (backendId: Backend['id']) => {
  return db.selectFrom('Backend').selectAll().where('id', '=', backendId).executeTakeFirst()
}

export const createBackend = async (backend: InsertableBackend) => {
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
  return db.updateTable('Backend').set(data).where('id', '=', id).execute()
}

export const deleteBackend = async (backendId: Backend['id']) => {
  return db.deleteFrom('Backend').where('id', '=', backendId).executeTakeFirstOrThrow()
}
