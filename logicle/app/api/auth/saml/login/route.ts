// app/api/auth/saml/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createPassportStrategy } from '@/lib/auth/saml'
import { runPassportStrategy } from '@/lib/auth/runStrategy'

export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connection')

  if (!connectionId) {
    return new NextResponse('Missing SAML connection', { status: 400 })
  }

  const strategy = await createPassportStrategy(connectionId)

  const { redirect } = await runPassportStrategy(strategy, req, {
    // This ends up as RelayState in the IdP round-trip
    additionalParams: {
      RelayState: JSON.stringify({ connectionId }),
    },
  })

  if (!redirect) {
    return new NextResponse('SAML did not return a redirect URL', { status: 500 })
  }

  return NextResponse.redirect(redirect)
}
