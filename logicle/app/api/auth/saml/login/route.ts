// app/api/auth/saml/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { findIdentityProvider, SamlIdentityProvider } from '@/lib/auth/saml'
import * as client from 'openid-client'
import { getClientConfig, getSession } from '@/lib/auth/oidc'
import { SAML } from '@node-saml/node-saml'

export async function getSamlLoginRedirectUrl(
  req: Request,
  identityProvider: SamlIdentityProvider,
  connectionId: string
) {
  const saml = new SAML(identityProvider.config)
  const relayState = JSON.stringify({ connectionId })
  const host = req.headers.get('host') ?? undefined
  const url = await saml.getAuthorizeUrlAsync(relayState, host, {
    additionalParams: {
      RelayState: relayState,
    },
  })
  return url
}

export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connection')
  if (!connectionId) {
    return new NextResponse('Missing SAML connection', { status: 400 })
  }

  const identityProvider = await findIdentityProvider(connectionId)
  if (identityProvider.type === 'OIDC') {
    const session = await getSession()
    const code_verifier = client.randomPKCECodeVerifier()
    const code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
    const openIdClientConfig = await getClientConfig(identityProvider)
    const parameters: Record<string, string> = {
      redirect_uri: `${process.env.APP_URL}/api/oauth/oidc`,
      scope: 'openid email',
      code_challenge,
      code_challenge_method: 'S256',
    }
    let state!: string
    if (openIdClientConfig.serverMetadata().supportsPKCE()) {
      state = client.randomState()
      parameters.state = state
    }
    const redirectTo = client.buildAuthorizationUrl(openIdClientConfig, parameters)
    session.code_verifier = code_verifier
    session.state = state
    session.idp = connectionId
    await session.save()
    return Response.redirect(redirectTo.href)
  } else {
    const redirect = await getSamlLoginRedirectUrl(req, identityProvider, connectionId)
    if (!redirect) {
      return new NextResponse('SAML did not return a redirect URL', { status: 500 })
    }
    return NextResponse.redirect(redirect)
  }
}
