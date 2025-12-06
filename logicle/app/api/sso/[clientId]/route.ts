import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { OIDCSSORecord, UpdateConnectionParams } from '@boxyhq/saml-jackson'
import { findIdentityProvidersRaw } from '@/lib/auth/saml'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = requireAdmin(async (_req: Request, params: { clientId: string }) => {
  const connection = await findIdentityProvidersRaw(params.clientId)
  if (!connection) {
    return ApiResponses.noSuchEntity()
  }
  return NextResponse.json(connection)
})

export const DELETE = requireAdmin(async (_req: Request, params: { clientId: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const clientId = params.clientId
  const connections = await apiController.getConnections({ clientID: clientId })
  if (connections.length === 0) {
    return ApiResponses.noSuchEntity()
  }
  if (connections.length !== 1) {
    return ApiResponses.internalServerError()
  }
  await apiController.deleteConnections({
    clientID: clientId,
    clientSecret: connections[0].clientSecret,
  })
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, params: { clientId: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { redirectUrl, defaultRedirectUrl, name, description } =
    (await req.json()) as UpdateConnectionParams
  const connection = await findIdentityProvidersRaw(params.clientId)
  if (!connection) {
    return ApiResponses.noSuchEntity()
  }
  if ((connection as unknown as OIDCSSORecord).oidcProvider) {
    await apiController.updateOIDCConnection({
      clientID: params.clientId,
      clientSecret: connection.clientSecret,
      product: connection.product,
      tenant: connection.tenant,
      redirectUrl,
      defaultRedirectUrl,
      name,
      description,
    })
  } else {
    await apiController.updateSAMLConnection({
      clientID: params.clientId,
      clientSecret: connection.clientSecret,
      product: connection.product,
      tenant: connection.tenant,
      redirectUrl,
      defaultRedirectUrl,
      name,
      description,
    })
  }
  return ApiResponses.success()
})
