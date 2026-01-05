// app/api/oauth/saml/route.ts (your ACS URL)
import { NextResponse } from 'next/server'
import { createSaml, findEmailInSamlProfile } from '@/lib/auth/saml'
import { addingSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'
import { findIdpConnection } from '@/models/sso'
import { getOrCreateUserByEmail } from '@/models/user'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const formData = await req.formData()
  const body = Object.fromEntries(formData.entries()) as Record<string, string>

  const relayStateRaw = body.RelayState
  const samlResponse = body.SAMLResponse

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

  const idpConnection = await findIdpConnection(connectionId)

  if (!idpConnection || idpConnection.type !== 'SAML') {
    return new NextResponse('Unknown SAML connection', { status: 400 })
  }

  const saml = createSaml(idpConnection.config)

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
    const email = findEmailInSamlProfile(profile)
    const user = await getOrCreateUserByEmail(email)
    // It is important to use a 303, so the browser will use GET. otherwise... cookies won't be accepted
    return addingSessionCookie(
      NextResponse.redirect(new URL('/chat', env.appUrl), 303),
      user,
      idpConnection
    )
  } catch (err) {
    console.error('SAML callback error', err)
    return new NextResponse('SAML callback failed', { status: 500 })
  }
}
