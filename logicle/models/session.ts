import { db } from 'db/database'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

export const createSession = async (
  userId: string,
  expiresAt: Date,
  authMethod: schema.Session['authMethod'],
  idpConnectionId: string | null
): Promise<schema.Session> => {
  const id = nanoid()
  const session = {
    id,
    userId,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
    authMethod,
    idpConnectionId,
  } satisfies schema.Session
  await db.insertInto('Session').values(session).executeTakeFirstOrThrow()
  return session
}

export const findStoredSession = async (sessionId: string) => {
  const row = await db
    .selectFrom('Session')
    .innerJoin('User', (join) => join.onRef('User.id', '=', 'Session.userId'))
    .selectAll('Session')
    .select(['User.id as userTableId', 'User.role as userRole'])
    .where('Session.id', '=', sessionId)
    .executeTakeFirst()

  if (!row) return undefined

  return {
    sessionId: row.id,
    userId: row.userTableId,
    userRole: row.userRole,
    expiresAt: row.expiresAt,
  }
}

export const deleteSessionById = async (sessionId: string) => {
  await db.deleteFrom('Session').where('id', '=', sessionId).execute()
}
