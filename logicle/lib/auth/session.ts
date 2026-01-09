import env from '../env'
import { IdpConnection } from '@/types/dto'
import { logger } from '../logging'
import { createSession, deleteSessionById, findStoredSession } from '@/models/session'
import { SimpleSession } from '@/types/session'
import { cookies } from 'next/headers'

export const SESSION_COOKIE_NAME = 'session'

export const makeExpiryDate = () => new Date(Date.now() + env.session.ttlHours * 60 * 60 * 1000)

export async function setSessionCookie(sessionId: string, expiresAt: Date) {
  const cookiesList = await cookies()
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  cookiesList.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: env.appUrl.startsWith('https'), // or always true if HTTPS everywhere
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: maxAgeSeconds,
  })
}

export async function addingSessionCookie(
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
  await setSessionCookie(session.id, expiresAt)
}

export async function removingSessionCookie() {
  try {
    const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value
    if (sessionId) {
      await deleteSessionById(sessionId)
    }
  } catch (err) {
    logger.warn('Failed to clean up session during logout', err)
  }
  ;(await cookies()).delete(SESSION_COOKIE_NAME)
}

export async function findStoredSessionFromCookie() {
  const sessionId = (await cookies()).get(SESSION_COOKIE_NAME)?.value
  if (!sessionId) return null
  const session = await findStoredSession(sessionId)
  if (!session) return null
  const expiresAt = new Date(session.expiresAt)
  if (expiresAt.getTime() <= Date.now()) {
    await deleteSessionById(sessionId)
    return null
  }
  return session
}

export async function readSessionFromRequest(
  req: Request,
  checkOrigin: boolean = false
): Promise<SimpleSession | null> {
  if (checkOrigin && req.headers.get('Sec-fetch-site') !== 'same-origin') {
    logger.warn(`Possible CSRF attack detected: request's fetch mode is not same-origin ${req.url}`)
    return null
  }
  const session = await findStoredSessionFromCookie()
  if (!session) {
    return null
  }
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    userRole: session.userRole,
  }
}
