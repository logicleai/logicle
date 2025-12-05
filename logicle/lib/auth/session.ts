import jwt from 'jsonwebtoken'
import { cookies } from 'next/headers'
import env from '../env'
import { NextRequest, NextResponse } from 'next/server'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 24 * 7 // 7 days

const JWT_SECRET = env.nextAuth.secret as string

type SessionPayload = {
  sub: string // user id
  email: string
  role: string
  exp: number // unix seconds
}

export function createSessionToken(user: { id: string; email: string; role: string }) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_HOURS * 60 * 60
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp,
  }
  return jwt.sign(payload, JWT_SECRET)
}

export function addingSessionCookie(
  res: NextResponse,
  user: { id: string; email: string; role: string }
) {
  const token = createSessionToken(user)
  res.cookies.set(SESSION_COOKIE_NAME, token)
  return res
}

export function removingSessionCookie(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE_NAME)
  return res
}

export async function readSessionFromSessionToken(token?: string): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload
  } catch {
    try {
      cookieStore.delete(SESSION_COOKIE_NAME)
    } catch (_e) {}
    return null
  }
}

export async function readSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)
  return readSessionFromSessionToken(sessionToken?.value)
}

export async function readSessionFromCookie(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  return readSessionFromSessionToken(token)
}
