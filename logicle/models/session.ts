import { db } from 'db/database'
import { nanoid } from 'nanoid'
import * as schema from '@/db/schema'

export interface SessionWithUser {
  session: schema.Session
  user: Pick<schema.User, 'id' | 'email' | 'role' | 'tokenVersion'>
}

export const createSession = async (
  userId: string,
  expiresAt: Date
): Promise<schema.Session> => {
  const session = {
    id: nanoid(),
    sessionToken: nanoid(),
    userId,
    expires: expiresAt.toISOString(),
  } satisfies schema.Session
  await db.insertInto('Session').values(session).executeTakeFirstOrThrow()
  return session
}

export const findSessionWithUser = async (
  sessionToken: string
): Promise<SessionWithUser | undefined> => {
  const row = await db
    .selectFrom('Session')
    .innerJoin('User', (join) => join.onRef('User.id', '=', 'Session.userId'))
    .selectAll('Session')
    .select([
      'User.id as userTableId',
      'User.email as userEmail',
      'User.role as userRole',
      'User.tokenVersion as userTokenVersion',
    ])
    .where('Session.sessionToken', '=', sessionToken)
    .executeTakeFirst()

  if (!row) return undefined

  return {
    session: {
      id: row.id,
      sessionToken: row.sessionToken,
      expires: row.expires,
      userId: row.userId,
    },
    user: {
      id: row.userTableId,
      email: row.userEmail,
      role: row.userRole,
      tokenVersion: row.userTokenVersion,
    },
  }
}

export const deleteSessionByToken = async (sessionToken: string) => {
  await db.deleteFrom('Session').where('sessionToken', '=', sessionToken).execute()
}
