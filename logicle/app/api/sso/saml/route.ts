import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a SAML connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { name, description, metadataUrl, rawMetadata } = await req.json()

  const connection = await apiController.createSAMLConnection({
    name: name,
    description: description,
    rawMetadata: rawMetadata,
    metadataUrl,
    defaultRedirectUrl: env.saml.redirectUrl,
    redirectUrl: env.saml.redirectUrl,
    tenant: tenant,
    product: env.product,
  })
  return ApiResponses.json(connection)
})
