import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a OIDC connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
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
