// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { addingSessionCookie } from '@/lib/auth/session'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '@/lib/auth'
import ApiResponses from '../../utils/ApiResponses'
import { loginRequestSchema } from '@/types/dto/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const result = loginRequestSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const body = result.data
  const user = await getUserByEmail(body.email)
  if (!user) {
    return ApiResponses.notAuthorized('invalid-credentials')
  }
  if (!user.password) {
    return ApiResponses.notAuthorized('authentication method not supported for this user')
  }
  const hasValidPassword = await verifyPassword(body.password, user.password)
  if (!hasValidPassword) {
    throw new Error('invalid-credentials')
  }
  return addingSessionCookie(NextResponse.json({ ok: true }), user)
}
