// app/api/oauth/saml/route.ts (your ACS URL)
import { NextRequest, NextResponse } from 'next/server'
import { createSamlStrategy } from '@/lib/auth/saml'
import { runPassportStrategy } from '@/lib/auth/runStrategy'

export async function POST(req: NextRequest) {
  // 1. Read the body ONCE
  const formData = await req.formData()
  const body = Object.fromEntries(formData.entries())

  // 2. Get RelayState + connectionId (or whatever you stored there)
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
    // 3. Pass the already-parsed body into runPassportStrategy
    const { user } = await runPassportStrategy(strategy, req, {}, body)

    if (!user) {
      return new NextResponse('SAML user missing', { status: 401 })
    }

    // 4. Create session + redirect wherever you like
    const res = NextResponse.redirect(new URL('/chat', req.url))
    // set cookies/session here
    return res
  } catch (err) {
    console.error('SAML callback error', err)
    return new NextResponse('SAML callback failed', { status: 500 })
  }
}
