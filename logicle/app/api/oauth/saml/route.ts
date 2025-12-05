// app/api/oauth/saml/route.ts (your ACS URL)
import { NextRequest, NextResponse } from 'next/server'
import {
  findIdentityProvider,
  findUserFromSamlProfile,
  SamlIdentityProvider,
} from '@/lib/auth/saml'
import { createSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'
import { SAML } from '@node-saml/node-saml'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const body = Object.fromEntries(formData.entries()) as Record<string, string>

  const relayStateRaw = body['RelayState']
  const samlResponse = body['SAMLResponse']

  if (!relayStateRaw) {
    return new NextResponse('Missing RelayState', { status: 400 })
  }

  if (!samlResponse) {
    return new NextResponse('Missing SAMLResponse', { status: 400 })
  }

  // --- Extract connectionId from RelayState (same as before) ---
  let connectionId: string
  try {
    const parsed = JSON.parse(relayStateRaw)
    connectionId = parsed.connectionId
  } catch {
    return new NextResponse('Invalid RelayState', { status: 400 })
  }

  // --- Look up IdP config and build node-saml instance ---
  const identityProvider = await findIdentityProvider(connectionId)

  if (!identityProvider || identityProvider.type !== 'SAML') {
    return new NextResponse('Unknown SAML connection', { status: 400 })
  }

  const samlConfig = (identityProvider as SamlIdentityProvider).config
  const saml = new SAML(samlConfig)

  try {
    // validatePostResponseAsync returns { profile?, loggedOut? }
    const { profile, loggedOut } = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      RelayState: relayStateRaw,
    })

    if (loggedOut) {
      // This would be SLO; you didn’t handle it before, so we can just
      // treat it as a simple “logged out” state or redirect to login.
      return NextResponse.redirect(new URL('/login', env.appUrl))
    }

    if (!profile) {
      return new NextResponse('SAML user missing', { status: 401 })
    }

    const user = await findUserFromSamlProfile(profile)
    if (!user) {
      return new NextResponse('User not found in db', { status: 400 })
    }

    await createSessionCookie(user)

    // It is important to use a 303, so the browser will use GET
    // otherwise... cookies won't be accepted
    return NextResponse.redirect(new URL('/chat', env.appUrl), 303)
  } catch (err) {
    console.error('SAML callback error', err)
    return new NextResponse('SAML callback failed', { status: 500 })
  }
}
