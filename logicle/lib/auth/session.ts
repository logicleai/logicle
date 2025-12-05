import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import env from '../env'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 24 * 7 // 7 days

const JWT_SECRET = env.nextAuth.secret

type SessionPayload = {
  sub: string // user id
  email: string
  role: string
  exp: number // unix seconds
}

export async function createSessionCookie(user: { id: string; email: string; role: string }) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_HOURS * 60 * 60
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp,
  }

  const token = jwt.sign(payload, JWT_SECRET)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    // You can also set `maxAge` instead of relying on exp inside JWT
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function readSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload
    // `jwt.verify` will throw if expired or invalid
    return decoded
  } catch {
    // invalid or expired token
    cookieStore.delete(SESSION_COOKIE_NAME)
    return null
  }
}
