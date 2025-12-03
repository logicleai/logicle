// app/api/oauth/saml/route.ts (your ACS URL)
import { NextRequest, NextResponse } from 'next/server'
import { createSamlStrategy } from '@/lib/auth/saml'
import { runPassportStrategy } from '@/lib/auth/runStrategy'
import { createSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const body = Object.fromEntries(formData.entries())
  const relayStateRaw = body['RelayState'] as string | undefined
  if (!relayStateRaw) {
    return new NextResponse('Missing RelayState', { status: 400 })
  }

  let connectionId: string
  try {
    const parsed = JSON.parse(relayStateRaw)
    connectionId = parsed.connectionId
  } catch {
    return new NextResponse('Invalid RelayState', { status: 400 })
  }

  const strategy = await createSamlStrategy(connectionId)

  try {
    const { user } = await runPassportStrategy(strategy, req, {}, body)
    if (!user) {
      return new NextResponse('SAML user missing', { status: 401 })
    }

    await createSessionCookie(user)
    const res = NextResponse.redirect(new URL('/chat', env.appUrl))
    return res
  } catch (err) {
    console.error('SAML callback error', err)
    return new NextResponse('SAML callback failed', { status: 500 })
  }
}
