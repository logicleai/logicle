import { NextResponse } from 'next/server'
import env from '@/lib/env'
import { getClientConfig, getSsoFlowSession } from '@/lib/auth/oidc'
import * as client from 'openid-client'
import { getOrCreateUserByEmail } from '@/models/user'
import { addSessionCookie } from '@/lib/auth/session'
import { findIdpConnection } from '@/models/sso'
import { error, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { logger } from '@/lib/logging'
import { KnownDbErrorCode, interpretDbException } from '@/db/exception'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'OIDC callback',
    description: 'Handle OIDC authorization code grant.',
    authentication: 'public',
    responses: [responseSpec(303), errorSpec(400), errorSpec(409), errorSpec(500)] as const,
    implementation: async (req: Request) => {
      const session = await getSsoFlowSession()
      const idpConnection = await findIdpConnection(session.idp)
      if (!idpConnection || idpConnection.type !== 'OIDC') {
        return error(400, 'Unknown OIDC connection')
      }
      if (!session.state) {
        return error(400, 'Invalid state')
      }
      try {
        const openIdClientConfig = await getClientConfig(idpConnection.config)
        const incoming = new URL(req.url)
        const currentUrl = new URL(`${env.appUrl}/${incoming.pathname}${incoming.search}`)
        const tokenSet = await client.authorizationCodeGrant(openIdClientConfig, currentUrl, {
          pkceCodeVerifier: session.code_verifier,
          expectedState: session.state,
        })
        session.destroy()

        const claims = tokenSet.claims()!
        const rawEmail = String(claims.email ?? '')
        const rawSub = String(claims.sub ?? '')
        const resolvedEmailOrSub = `${claims.email ?? claims.sub ?? ''}`
        const normalizedEmailOrSub = resolvedEmailOrSub.trim().toLowerCase()
        logger.info('OIDC callback claims received', {
          idpConnectionId: idpConnection.id,
          hasEmailClaim: !!claims.email,
          emailRaw: rawEmail,
          emailJson: JSON.stringify(rawEmail),
          subRaw: rawSub,
          resolvedEmailOrSub,
          resolvedEmailOrSubJson: JSON.stringify(resolvedEmailOrSub),
          normalizedEmailOrSub,
        })

        if (!normalizedEmailOrSub) {
          return error(400, 'OIDC claims missing email/sub')
        }

        try {
          const user = await getOrCreateUserByEmail(normalizedEmailOrSub)
          await addSessionCookie(user, idpConnection, req)
          return NextResponse.redirect(new URL('/chat', env.appUrl), 303)
        } catch (e) {
          const dbErrorCode = interpretDbException(e)
          logger.error('OIDC user provisioning failed', {
            idpConnectionId: idpConnection.id,
            normalizedEmailOrSub,
            dbErrorCode,
            dbCode: (e as { code?: string }).code,
            dbConstraint: (e as { constraint?: string }).constraint,
          })
          if (dbErrorCode === KnownDbErrorCode.DUPLICATE_KEY) {
            return error(409, 'OIDC user provisioning conflict', {
              email: normalizedEmailOrSub,
              constraint: (e as { constraint?: string }).constraint ?? null,
            })
          }
          return error(500, 'OIDC user provisioning failed', {
            email: normalizedEmailOrSub,
          })
        }
      } catch (e) {
        logger.error('OIDC callback failed during token exchange', {
          idpConnectionId: idpConnection.id,
          error: e instanceof Error ? e.message : String(e),
        })
        return error(400, 'OIDC token exchange failed')
      }
    },
  }),
})
