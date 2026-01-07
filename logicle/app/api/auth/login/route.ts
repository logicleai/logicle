// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { addingSessionCookie } from '@/lib/auth/session'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '@/lib/auth'
import { loginRequestSchema } from '@/types/dto/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const result = loginRequestSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json(
      { error: { message: 'Invalid body', values: result.error.format() } },
      { status: 400 }
    )
  }
  const body = result.data
  const user = await getUserByEmail(body.email)
  if (!user) {
    return NextResponse.json(
      { error: { message: 'invalid-credentials', values: {} } },
      { status: 401 }
    )
  }
  if (!user.password) {
    return NextResponse.json(
      { error: { message: 'authentication method not supported for this user', values: {} } },
      { status: 401 }
    )
  }
  const hasValidPassword = await verifyPassword(body.password, user.password)
  if (!hasValidPassword) {
    throw new Error('invalid-credentials')
  }
  return addingSessionCookie(NextResponse.json({ ok: true }), user)
}
