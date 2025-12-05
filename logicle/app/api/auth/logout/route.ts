// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { removingSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  return removingSessionCookie(NextResponse.json({ ok: true }))
}
