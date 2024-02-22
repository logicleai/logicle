import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextRequest } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateSAMLConnectionParams } from '@foosoftsrl/saml-jackson'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a SAML connection.
export const POST = requireAdmin(async (req: Request) => {
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

export const PATCH = requireAdmin(async (req: Request) => {
  const { apiController } = await jackson()
  const { clientID, clientSecret, redirectUrl, defaultRedirectUrl, tenant, product } =
    (await req.json()) as UpdateSAMLConnectionParams

  await apiController.updateSAMLConnection({
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
  const { apiController } = await jackson()
  const clientID = req.nextUrl.searchParams.get('clientID') ?? ''
  const clientSecret = req.nextUrl.searchParams.get('clientSecret') ?? ''
  await apiController.deleteConnections({ clientID, clientSecret })
  return ApiResponses.success()
})
