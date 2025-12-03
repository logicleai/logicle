// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { authenticateLocal } from '@/lib/auth/local'
import { clearSessionCookie, createSessionCookie } from '@/lib/auth/session'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  await clearSessionCookie()
  const res = NextResponse.json({ ok: true })
  return res
}
