import * as dto from '@/types/dto'
import { db } from '@/db/database'

export const findIdpConnection = async (id: string): Promise<dto.IdpConnection | undefined> => {
  const entry = await db
    .selectFrom('IdpConnection')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst()
  if (!entry) return undefined
  return {
    ...entry,
    config: JSON.parse(entry.config),
  }
}

export const listIdpConnections = async (): Promise<dto.IdpConnection[]> => {
  const list = await db.selectFrom('IdpConnection').selectAll().execute()
  return list.map((entry) => {
    return {
      ...entry,
      config: JSON.parse(entry.config),
    }
  })
}

export const deleteIdpConnection = async (id: string) => {
  await db.deleteFrom('IdpConnection').where('id', '=', id).execute()
}
