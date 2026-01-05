// app/api/auth/saml/login/route.ts
import { NextResponse } from 'next/server'
import * as client from 'openid-client'
import { getClientConfig, getSession } from '@/lib/auth/oidc'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { findIdpConnection } from '@/models/sso'
import { getSamlLoginRedirectUrl } from '@/lib/auth/saml'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const connectionId = url.searchParams.get('connection')
  if (!connectionId) {
    return ApiResponses.invalidParameter('Missing connection')
  }

  const idpConnection = await findIdpConnection(connectionId)
  if (!idpConnection) {
    return ApiResponses.noSuchEntity('Unknown connection')
  }
  if (idpConnection.type === 'OIDC') {
    const session = await getSession()
    const code_verifier = client.randomPKCECodeVerifier()
    const code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
    const openIdClientConfig = await getClientConfig(idpConnection.config)
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
    const redirect = await getSamlLoginRedirectUrl(req, idpConnection)
    if (!redirect) {
      return new NextResponse('SAML did not return a redirect URL', { status: 500 })
    }
    return NextResponse.redirect(redirect)
  }
}
