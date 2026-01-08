// app/api/oauth/saml/route.ts (ACS URL)
import { NextResponse } from 'next/server'
import { createSaml, findEmailInSamlProfile } from '@/lib/auth/saml'
import { addingSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'
import { findIdpConnection } from '@/models/sso'
import { getOrCreateUserByEmail } from '@/models/user'
import { error, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { getSsoFlowSession } from '@/lib/auth/oidc'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'SAML ACS',
    description: 'Handle SAML ACS response.',
    authentication: 'public',
    responses: [responseSpec(303), errorSpec(400), errorSpec(401), errorSpec(500)] as const,
    implementation: async (req: Request) => {
      const formData = await req.formData()
      const body = Object.fromEntries(formData.entries()) as Record<string, string>

      const relayStateRaw = body.RelayState
      const samlResponse = body.SAMLResponse

      if (!relayStateRaw) {
        return error(400, 'Missing RelayState')
      }

      if (!samlResponse) {
        return error(400, 'Missing SAMLResponse')
      }

      let connectionId: string
      let relayStateNonce: string | undefined
      try {
        const parsed = JSON.parse(relayStateRaw)
        connectionId = parsed.connectionId
        relayStateNonce = parsed.state
      } catch {
        return error(400, 'Invalid RelayState')
      }

      const idpConnection = await findIdpConnection(connectionId)

      if (!idpConnection || idpConnection.type !== 'SAML') {
        return error(400, 'Unknown SAML connection')
      }

      const session = await getSsoFlowSession()
      if (
        !relayStateNonce ||
        !session.state ||
        relayStateNonce !== session.state ||
        session.idp !== connectionId
      ) {
        return error(400, 'Invalid RelayState')
      }
      session.destroy()

      const saml = createSaml(idpConnection.config)

      try {
        const { profile, loggedOut } = await saml.validatePostResponseAsync({
          SAMLResponse: samlResponse,
          RelayState: relayStateRaw,
        })

        if (loggedOut) {
          return NextResponse.redirect(new URL('/login', env.appUrl))
        }

        if (!profile) {
          return error(401, 'SAML user missing')
        }
        const email = findEmailInSamlProfile(profile)
        const user = await getOrCreateUserByEmail(email)
        const res = await addingSessionCookie(
          NextResponse.redirect(new URL('/chat', env.appUrl), 303),
          user,
          idpConnection
        )
        return res
      } catch (err) {
        console.error('SAML callback error', err)
        return error(500, 'SAML callback failed')
      }
    },
  }),
})
