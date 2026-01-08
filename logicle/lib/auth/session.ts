import env from '../env'
import { NextResponse } from 'next/server'
import { IdpConnection } from '@/types/dto'
import { logger } from '../logging'
import { cookies } from 'next/headers'
import { createSession, deleteSessionByToken, findSessionWithUser } from '@/models/session'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 24 * 7 // 7 days

type SessionPayload = {
  sub: string // user id
  email: string
  role: string
  exp: number // unix seconds
  tokenVersion: number
  idp?: string
}

const makeExpiryDate = () => new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000)

export async function addingSessionCookie(
  res: NextResponse,
  user: { id: string; email: string; role: string; tokenVersion: number },
  _idpConnection?: IdpConnection
) {
  const expiresAt = makeExpiryDate()
  const session = await createSession(user.id, expiresAt)
  res.cookies.set(SESSION_COOKIE_NAME, session.sessionToken, {
    httpOnly: true,
    secure: env.appUrl.startsWith('https'), // or always true if HTTPS everywhere
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  })
  return res
}

export async function removingSessionCookie(res: NextResponse) {
  try {
    const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)?.value
    if (sessionToken) {
      await deleteSessionByToken(sessionToken)
    }
  } catch (err) {
    logger.warn('Failed to clean up session during logout', err)
  }
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}

export async function readSessionFromSessionToken(token: string): Promise<SessionPayload | null> {
  const session = await findSessionWithUser(token)
  if (!session) return null
  const expiresAt = new Date(session.session.expires)
  if (expiresAt.getTime() <= Date.now()) {
    await deleteSessionByToken(token)
    return null
  }
  return {
    sub: session.user.id,
    email: session.user.email,
    role: session.user.role,
    exp: Math.floor(expiresAt.getTime() / 1000),
    tokenVersion: session.user.tokenVersion,
  }
}

export async function readSessionFromRequest(
  req: Request,
  checkOrigin: boolean = false
): Promise<SessionPayload | null> {
  if (checkOrigin && req.headers.get('Sec-fetch-site') !== 'same-origin') {
    logger.warn(`Possible CSRF attack detected: request's fetch mode is not same-origin ${req.url}`)
    return null
  }
  const sessionToken = (await cookies()).get(SESSION_COOKIE_NAME)
  if (!sessionToken) return null
  return readSessionFromSessionToken(sessionToken.value)
}
