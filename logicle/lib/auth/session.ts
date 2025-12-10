import jwt from 'jsonwebtoken'
import env from '../env'
import { NextRequest, NextResponse } from 'next/server'
import { IdpConnection } from '@/types/dto'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_TTL_HOURS = 24 * 7 // 7 days

const JWT_SECRET = env.nextAuth.secret as string

type SessionPayload = {
  sub: string // user id
  email: string
  role: string
  exp: number // unix seconds
  tokenVersion: number
  idp?: string
}

export function createSessionToken(
  user: {
    id: string
    email: string
    role: string
    tokenVersion: number
  },
  idpConnection?: IdpConnection
) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_HOURS * 60 * 60
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    exp,
    ...(idpConnection ? { idp: idpConnection.id } : {}),
  } satisfies SessionPayload
  return jwt.sign(payload, JWT_SECRET)
}

export function addingSessionCookie(
  res: NextResponse,
  user: { id: string; email: string; role: string; tokenVersion: number },
  idpConnection?: IdpConnection
) {
  const token = createSessionToken(user, idpConnection)
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
      await cookieStore.delete(SESSION_COOKIE_NAME)
    } catch (_e) {}
    return null
  }
}

export async function readSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)
  return readSessionFromSessionToken(sessionToken?.value)
}
