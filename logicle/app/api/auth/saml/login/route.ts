// app/api/auth/saml/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createPassportStrategyForIdentityProvider, findIdentityProvider } from '@/lib/auth/saml'
import * as client from 'openid-client'
import { runPassportStrategy } from '@/lib/auth/runStrategy'
import { getClientConfig, getSession } from '@/lib/auth/oidc'

export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connection')

  if (!connectionId) {
    return new NextResponse('Missing SAML connection', { status: 400 })
  }

  const identityProvider = await findIdentityProvider(connectionId)
  if (identityProvider.type == 'OIDC') {
    const session = await getSession()
    let code_verifier = client.randomPKCECodeVerifier()
    let code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
    const openIdClientConfig = await getClientConfig(identityProvider)
    let parameters: Record<string, string> = {
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
    let redirectTo = client.buildAuthorizationUrl(openIdClientConfig, parameters)
    session.code_verifier = code_verifier
    session.state = state
    session.idp = connectionId
    await session.save()
    return Response.redirect(redirectTo.href)
  } else {
    const strategy = await createPassportStrategyForIdentityProvider(identityProvider)

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
}
