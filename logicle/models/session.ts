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
    authMethod: row.authMethod,
    idpConnectionId: row.idpConnectionId,
  }
}

export const deleteSessionById = async (sessionId: string) => {
  await db.deleteFrom('Session').where('id', '=', sessionId).execute()
}

export const updateSessionExpiry = async (sessionId: string, expiresAt: Date) => {
  await db
    .updateTable('Session')
    .set({ expiresAt: expiresAt.toISOString() })
    .where('id', '=', sessionId)
    .execute()
}

export const listUserSessions = async (userId: string, now: Date) => {
  return await db
    .selectFrom('Session')
    .selectAll()
    .where('userId', '=', userId)
    .where('expiresAt', '>', now.toISOString())
    .orderBy('createdAt', 'desc')
    .execute()
}

export const getUserSessionById = async (userId: string, sessionId: string) => {
  return await db
    .selectFrom('Session')
    .selectAll()
    .where('id', '=', sessionId)
    .where('userId', '=', userId)
    .executeTakeFirst()
}

export const deleteUserSessionById = async (userId: string, sessionId: string) => {
  await db
    .deleteFrom('Session')
    .where('id', '=', sessionId)
    .where('userId', '=', userId)
    .execute()
}
