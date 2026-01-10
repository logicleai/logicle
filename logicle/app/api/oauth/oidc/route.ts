import { NextResponse } from 'next/server'
import env from '@/lib/env'
import { getClientConfig, getSsoFlowSession } from '@/lib/auth/oidc'
import * as client from 'openid-client'
import { getOrCreateUserByEmail } from '@/models/user'
import { addSessionCookie } from '@/lib/auth/session'
import { findIdpConnection } from '@/models/sso'
import { operation, responseSpec, errorSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'OIDC callback',
    description: 'Handle OIDC authorization code grant.',
    authentication: 'public',
    responses: [responseSpec(303), errorSpec(400)] as const,
    implementation: async (req: Request) => {
      const session = await getSsoFlowSession()
      const idpConnection = await findIdpConnection(session.idp)
      if (!idpConnection || idpConnection.type !== 'OIDC') {
        return NextResponse.json(
          { error: { message: 'Unknown OIDC connection', values: {} } },
          { status: 400 }
        )
      }
      if (!session.state) {
        return NextResponse.json(
          { error: { message: 'Invalid state', values: {} } },
          { status: 400 }
        )
      }
      const openIdClientConfig = await getClientConfig(idpConnection.config)
      const incoming = new URL(req.url)
      const currentUrl = new URL(`${env.appUrl}/${incoming.pathname}${incoming.search}`)
      const tokenSet = await client.authorizationCodeGrant(openIdClientConfig, currentUrl, {
        pkceCodeVerifier: session.code_verifier,
        expectedState: session.state,
      })
      session.destroy()
      const claims = tokenSet.claims()!
      const email = `${claims.email ?? claims.sub}`
      const user = await getOrCreateUserByEmail(email)
      await addSessionCookie(user, idpConnection, req)
      return NextResponse.redirect(new URL('/chat', env.appUrl), 303)
    },
  }),
})
