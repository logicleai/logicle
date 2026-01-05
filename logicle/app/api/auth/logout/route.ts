// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { removingSessionCookie } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request) {
  return removingSessionCookie(NextResponse.json({ ok: true }))
}
