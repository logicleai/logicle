import { NextRequest } from 'next/server'
import env from '@/lib/env'
import { getClientConfig, getSession } from '@/lib/auth/oidc'
import * as client from 'openid-client'
import { findIdentityProvider, OidcIdentityProvider } from '@/lib/auth/saml'
import { getUserByEmail } from '@/models/user'
import { createSessionCookie } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const identityProvider = await findIdentityProvider(session.idp)!
  const openIdClientConfig = await getClientConfig(
    identityProvider as unknown as OidcIdentityProvider
  )
  const currentUrl = new URL(`${env.appUrl}/${req.nextUrl.pathname}${req.nextUrl.search}`)
  const tokenSet = await client.authorizationCodeGrant(openIdClientConfig, currentUrl, {
    pkceCodeVerifier: session.code_verifier,
    expectedState: session.state,
  })
  let claims = tokenSet.claims()!
  const email = claims.email ?? claims.sub
  const user = await getUserByEmail(`${email}`)
  if (!user) {
    throw new Error('invalid-credentials')
  }
  await session.save()
  createSessionCookie(user)
  return Response.redirect(new URL('/chat', env.appUrl))
}
