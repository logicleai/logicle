import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextRequest } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateOIDCConnectionParams } from '@foosoftsrl/saml-jackson'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a OIDC connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.ssoConfigLock) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { name, description, discoveryUrl, clientId, clientSecret } = await req.json()

  const connection = await apiController.createOIDCConnection({
    name: name,
    description: description,
    defaultRedirectUrl: env.oidc.redirectUrl,
    redirectUrl: env.oidc.redirectUrl,
    tenant: tenant,
    product: env.product,
    oidcDiscoveryUrl: discoveryUrl,
    oidcClientId: clientId,
    oidcClientSecret: clientSecret,
  })
  return ApiResponses.json(connection)
})

export const PATCH = requireAdmin(async (req: Request) => {
  if (env.ssoConfigLock) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { clientID, clientSecret, redirectUrl, defaultRedirectUrl, tenant, product } =
    (await req.json()) as UpdateOIDCConnectionParams

  await apiController.updateOIDCConnection({
    clientID,
    clientSecret,
    defaultRedirectUrl,
    redirectUrl,
    tenant,
    product,
  })
  return ApiResponses.json({})
})

export const DELETE = requireAdmin(async (req: NextRequest) => {
  if (env.ssoConfigLock) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const clientID = req.nextUrl.searchParams.get('clientID') ?? ''
  const clientSecret = req.nextUrl.searchParams.get('clientSecret') ?? ''
  await apiController.deleteConnections({ clientID, clientSecret })
  return ApiResponses.success()
})
