import env from '../env'
import { NextResponse } from 'next/server'
import { IdpConnection } from '@/types/dto'
import { logger } from '../logging'
import { cookies } from 'next/headers'
import { createSession, deleteSessionById, findStoredSession } from '@/models/session'
import { SimpleSession } from '@/types/session'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 24 * 90 // 90 days
const SESSION_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

const makeExpiryDate = () => new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000)

function setSessionCookie(res: NextResponse, sessionId: string, expiresAt: Date) {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  res.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: env.appUrl.startsWith('https'), // or always true if HTTPS everywhere
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: maxAgeSeconds,
  })
}

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
  setSessionCookie(res, session.id, expiresAt)
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

export type RefreshSessionResult = {
  refreshed: boolean
  expiresAt: Date
  sessionId: string
}

export async function refreshSessionFromCookies(): Promise<RefreshSessionResult | null> {
  const session = await findStoredSessionFromCookie()
  if (!session) return null
  const expiresAt = new Date(session.expiresAt)
  const remainingMs = expiresAt.getTime() - Date.now()
  if (remainingMs > SESSION_REFRESH_THRESHOLD_MS) {
    return { refreshed: false, expiresAt, sessionId: session.sessionId }
  }

  const newExpiresAt = makeExpiryDate()
  const newSession = await createSession(
    session.userId,
    newExpiresAt,
    session.authMethod,
    session.idpConnectionId
  )
  await deleteSessionById(session.sessionId)
  return {
    refreshed: true,
    expiresAt: newExpiresAt,
    sessionId: newSession.id,
  }
}

export { setSessionCookie }
