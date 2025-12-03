// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authenticateLocal } from '@/lib/auth/local'
import { createSessionCookie } from '@/lib/auth/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { user } = await authenticateLocal(req)
  if (!user) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  await createSessionCookie(user)
  const res = NextResponse.json({ ok: true })
  return res
}
