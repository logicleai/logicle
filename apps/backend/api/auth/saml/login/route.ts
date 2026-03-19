// app/api/auth/saml/login/route.ts
import * as client from 'openid-client'
import { getClientConfig, getSsoFlowSession } from '@/lib/auth/oidc'
import { findIdpConnection } from '@/models/sso'
import { getSamlLoginRedirectUrl } from '@/lib/auth/saml'
import { operation, responseSpec, errorSpec } from '@/lib/routes'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'SAML login redirect',
  description: 'Initiate login against an IdP connection.',
  authentication: 'public',
  preventCrossSite: true,
  querySchema: z.object({
    connection: z.string().optional(),
  }),
  responses: [responseSpec(302), errorSpec(400), errorSpec(404)] as const,
  implementation: async (req: Request, _params, { query }) => {
    const connectionId = query.connection
    if (!connectionId) {
      return Response.json(
        { error: { message: 'Missing connection', values: {} } },
        { status: 400 }
      )
    }

    const idpConnection = await findIdpConnection(connectionId)
    if (!idpConnection) {
      return Response.json(
        { error: { message: 'Unknown connection', values: {} } },
        { status: 404 }
      )
    }
    if (idpConnection.type === 'OIDC') {
      const session = await getSsoFlowSession()
      const code_verifier = client.randomPKCECodeVerifier()
      const code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
      const openIdClientConfig = await getClientConfig(idpConnection.config)
      const state = client.randomState()
      const parameters: Record<string, string> = {
        redirect_uri: `${process.env.APP_URL}/api/oauth/oidc`,
        scope: 'openid email',
        code_challenge,
        code_challenge_method: 'S256',
        state,
      }
      const redirectTo = client.buildAuthorizationUrl(openIdClientConfig, parameters)
      session.code_verifier = code_verifier
      session.state = state
      session.idp = connectionId
      await session.save()
      return Response.redirect(redirectTo.href)
    } else {
      const session = await getSsoFlowSession()
      const state = crypto.randomUUID()
      session.state = state
      session.idp = connectionId
      await session.save()
      const redirect = await getSamlLoginRedirectUrl(req, idpConnection, state)
      if (!redirect) {
        return Response.json(
          { error: { message: 'SAML did not return a redirect URL', values: {} } },
          { status: 500 }
        )
      }
      return Response.redirect(redirect)
    }
  },
})
