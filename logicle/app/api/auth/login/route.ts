// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionCookie } from '@/lib/auth/session'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '@/lib/auth'
import ApiResponses from '../../utils/ApiResponses'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const params = await req.json()
  const email = params.email
  const password = params.password
  if (!password || !email) {
    return ApiResponses.invalidParameter('missing email / password')
  }
  const user = await getUserByEmail(email)
  if (!user) {
    return ApiResponses.notAuthorized('invalid-credentials')
  }
  if (!user.password) {
    return ApiResponses.notAuthorized('authentication method not supported for this user')
  }
  const hasValidPassword = await verifyPassword(password, user.password)
  if (!hasValidPassword) {
    throw new Error('invalid-credentials')
  }
  await createSessionCookie(user)
  const res = NextResponse.json({ ok: true })
  return res
}
