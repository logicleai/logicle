import env from '@/lib/env'
import { IdpConnection } from '@/types/dto'
import { logger } from '@/lib/logging'
import {
  createSession,
  deleteSessionById,
  findStoredSession,
  updateSessionActivity,
} from '@/models/session'
import { SimpleSession } from '@/types/session'
import { getCookieValue, type MutableCookieStore } from '@/lib/http/cookies'

export const SESSION_COOKIE_NAME = 'session'

export const makeExpiryDate = () => new Date(Date.now() + env.session.ttlHours * 60 * 60 * 1000)

const ipHeaderCandidates = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
  'fastly-client-ip',
]

const normalizeHeaderValue = (value: string | null) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const extractIpAddress = (headers: Headers) => {
  for (const headerName of ipHeaderCandidates) {
    const headerValue = normalizeHeaderValue(headers.get(headerName))
    if (!headerValue) continue
    if (headerName === 'x-forwarded-for') {
      const forwarded = headerValue.split(',')[0]?.trim()
      if (forwarded) {
        return forwarded
      }
      continue
    }
    return headerValue
  }
  return null
}

const extractUserAgent = (headers: Headers) => {
  return normalizeHeaderValue(headers.get('user-agent'))
}

type SessionMetadataSource = {
  headers: Headers
}

const buildSessionMetadata = (source?: SessionMetadataSource) => {
  if (!source) return undefined
  return {
    userAgent: extractUserAgent(source.headers) ?? undefined,
    ipAddress: extractIpAddress(source.headers) ?? undefined,
  }
}

export function setSessionCookie(cookies: MutableCookieStore, sessionId: string, expiresAt: Date) {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: env.appUrl.startsWith('https'), // or always true if HTTPS everywhere
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: maxAgeSeconds,
  })
}

export async function addSessionCookie(
  user: { id: string; email: string; role: string },
  cookies: MutableCookieStore,
  idpConnection?: IdpConnection,
  requestInfo?: SessionMetadataSource
) {
  const expiresAt = makeExpiryDate()
  const session = await createSession(
    user.id,
    expiresAt,
    idpConnection ? 'idp' : 'password',
    idpConnection?.id ?? null,
    buildSessionMetadata(requestInfo)
  )
  setSessionCookie(cookies, session.id, expiresAt)
}

export async function removeSessionCookie(headers: Headers, cookies: MutableCookieStore) {
  try {
    const sessionId = getCookieValue(headers, SESSION_COOKIE_NAME)
    if (sessionId) {
      await deleteSessionById(sessionId)
    }
  } catch (err) {
    logger.warn('Failed to clean up session during logout', err)
  }
  cookies.delete(SESSION_COOKIE_NAME)
}

export async function findStoredSessionFromCookie(headers: Headers) {
  const sessionId = getCookieValue(headers, SESSION_COOKIE_NAME)
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
  if (
    checkOrigin &&
    env.csrf.enableProtection &&
    req.headers.get('Sec-fetch-site') === 'cross-site'
  ) {
    logger.warn(`Possible CSRF attack detected: request's fetch mode is not same-origin ${req.url}`)
    return null
  }
  const session = await findStoredSessionFromCookie(req.headers)
  if (!session) {
    return null
  }
  try {
    await updateSessionActivity(session.sessionId, {
      lastSeenAt: new Date(),
      ...buildSessionMetadata({ headers: req.headers }),
    })
  } catch (err) {
    logger.warn('Failed to update session activity', err)
  }
  return {
    sessionId: session.sessionId,
    userId: session.userId,
  }
}
