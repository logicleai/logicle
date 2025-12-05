// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  await clearSessionCookie()
  const res = NextResponse.json({ ok: true })
  return res
}
