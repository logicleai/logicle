import { NextRequest, NextResponse } from 'next/server'
import env from '@/lib/env'
import { getClientConfig, getSession } from '@/lib/auth/oidc'
import * as client from 'openid-client'
import { getUserByEmail } from '@/models/user'
import { addingSessionCookie } from '@/lib/auth/session'
import { findIdpConnection } from '@/models/sso'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const identityProvider = await findIdpConnection(session.idp)
  if (!identityProvider || identityProvider.type !== 'OIDC') {
    return new NextResponse('Unknown OIDC connection', { status: 400 })
  }
  const openIdClientConfig = await getClientConfig(identityProvider.config)
  const currentUrl = new URL(`${env.appUrl}/${req.nextUrl.pathname}${req.nextUrl.search}`)
  const tokenSet = await client.authorizationCodeGrant(openIdClientConfig, currentUrl, {
    pkceCodeVerifier: session.code_verifier,
    expectedState: session.state,
  })
  const claims = tokenSet.claims()!
  const email = claims.email ?? claims.sub
  const user = await getUserByEmail(`${email}`)
  if (!user) {
    throw new Error('invalid-credentials')
  }
  await session.save()
  // It is important to use a 303, so the browser will use GET. otherwise... cookies won't be accepted
  return addingSessionCookie(NextResponse.redirect(new URL('/chat', env.appUrl), 303), user)
}
