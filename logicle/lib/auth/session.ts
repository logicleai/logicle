import env from '../env'
import { NextResponse } from 'next/server'
import { IdpConnection } from '@/types/dto'
import { logger } from '../logging'
import { cookies } from 'next/headers'
import { createSession, deleteSessionById, findStoredSession } from '@/models/session'
import { SimpleSession } from '@/types/session'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 60 * 24 * 90 // 7 days

const makeExpiryDate = () => new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000)

export async function addingSessionCookie(
  res: NextResponse,
  user: { id: string; email: string; role: string },
  idpConnection?: IdpConnection
) {
  const expiresAt = makeExpiryDate()
  const session = await createSession(
    user.id,
    expiresAt,
    idpConnection ? 'idp' : 'password',
    idpConnection?.id ?? null
  )
  res.cookies.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    secure: env.appUrl.startsWith('https'), // or always true if HTTPS everywhere
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  })
  return res
}

export async function removingSessionCookie(res: NextResponse) {
  try {
    const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value
    if (sessionId) {
      await deleteSessionById(sessionId)
    }
  } catch (err) {
    logger.warn('Failed to clean up session during logout', err)
  }
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}

export async function readSessionFromRequest(
  req: Request,
  checkOrigin: boolean = false
): Promise<SimpleSession | null> {
  if (checkOrigin && req.headers.get('Sec-fetch-site') !== 'same-origin') {
    logger.warn(`Possible CSRF attack detected: request's fetch mode is not same-origin ${req.url}`)
    return null
  }
  const sessionCookie = (await cookies()).get(SESSION_COOKIE_NAME)
  if (!sessionCookie) return null
  const session = await findStoredSession(sessionCookie.value)
  if (!session) return null
  if (session.expiresAt) {
    const expiresAt = new Date(session.expiresAt)
    if (expiresAt.getTime() <= Date.now()) {
      await deleteSessionById(sessionCookie.value)
      return null
    }
  }
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    userRole: session.userRole,
  }
}
