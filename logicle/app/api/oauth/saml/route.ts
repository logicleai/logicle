// app/api/oauth/saml/route.ts (your ACS URL)
import { NextRequest, NextResponse } from 'next/server'
import { findIdentityProvider, SamlIdentityProvider } from '@/lib/auth/saml'
import { createSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'
import { Profile, SAML } from '@node-saml/node-saml'
import { getUserByEmail } from '@/models/user'
import { Kufam } from 'next/font/google'

async function findUserFromProfile(profile: Profile) {
  const email =
    (profile as any).mail ||
    (profile as any).nameID ||
    (profile as any).email ||
    (profile as any)['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress']

  if (!email) {
    throw new Error('No email in SAML profile')
  }
  const user = await getUserByEmail(email as string)
  if (!user) {
    throw new Error('invalid-credentials')
  }
  return user
}

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

    const user = await findUserFromProfile(profile)
    if (!user) {
      return new NextResponse('User not found in db', { status: 400 })
    }
    // You used to get `user` from Passport's verify callback.
    // For now, we can just use the SAML profile directly as "user",
    // or you can map it to your own shape here.
    // Example: await createSessionCookie(mapSamlProfileToUser(profile))
    await createSessionCookie(user)

    return NextResponse.redirect(new URL('/chat', env.appUrl))
  } catch (err) {
    console.error('SAML callback error', err)
    return new NextResponse('SAML callback failed', { status: 500 })
  }
}
