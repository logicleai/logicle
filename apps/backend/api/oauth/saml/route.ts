// app/api/oauth/saml/route.ts (ACS URL)
import { createSaml, findEmailInSamlProfile } from '@/lib/auth/saml'
import { addSessionCookie } from '@/lib/auth/session'
import env from '@/lib/env'
import { findIdpConnection } from '@/models/sso'
import { getOrCreateUserByEmail } from '@/models/user'
import { error, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getSsoFlowSession } from '@/lib/auth/oidc'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'SAML ACS',
  description: 'Handle SAML ACS response.',
  authentication: 'public',
  responses: [responseSpec(303), errorSpec(400), errorSpec(401), errorSpec(500)] as const,
  implementation: async ({ headers, cookies, request }) => {
    const session = await getSsoFlowSession(cookies)
    const parsedFormData = await request.formData()
    const body = Object.fromEntries(parsedFormData.entries()) as Record<string, string>

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
        return Response.redirect(new URL('/login', env.appUrl))
      }

      if (!profile) {
        return error(401, 'SAML user missing')
      }
      const email = findEmailInSamlProfile(profile)
      const user = await getOrCreateUserByEmail(email)
      await addSessionCookie(user, cookies, idpConnection, { headers })
      return Response.redirect(new URL('/chat', env.appUrl), 303)
    } catch (err) {
      console.error('SAML callback error', err)
      return error(500, 'SAML callback failed')
    }
  },
})
