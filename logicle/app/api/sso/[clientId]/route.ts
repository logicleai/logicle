import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  OIDCSSORecord,
  UpdateOIDCConnectionParams,
  UpdateSAMLConnectionParams,
} from '@foosoftsrl/saml-jackson'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Get the SAML connections.
export const GET = requireAdmin(async (req: Request, route: { params: { clientId: string } }) => {
  const { apiController } = await jackson()
  const connections = await apiController.getConnections({
    clientID: route.params.clientId,
  })
  if (connections.length == 0) {
    return ApiResponses.noSuchEntity()
  }
  return NextResponse.json(connections[0])
})

export const DELETE = requireAdmin(
  async (req: Request, route: { params: { clientId: string } }) => {
    if (env.sso.locked) {
      return ApiResponses.forbiddenAction('sso_locked')
    }
    const { apiController } = await jackson()
    const clientId = route.params.clientId
    const connections = await apiController.getConnections({ clientID: clientId })
    if (connections.length == 0) {
      return ApiResponses.noSuchEntity()
    }
    if (connections.length != 1) {
      return ApiResponses.internalServerError()
    }
    await apiController.deleteConnections({
      clientID: clientId,
      clientSecret: connections[0].clientSecret,
    })
    return ApiResponses.success()
  }
)

export const PATCH = requireAdmin(async (req: Request, route: { params: { clientId: string } }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { redirectUrl, defaultRedirectUrl } = (await req.json()) as UpdateSAMLConnectionParams
  const connections = await apiController.getConnections({ clientID: route.params.clientId })
  if (connections.length == 0) {
    return ApiResponses.noSuchEntity()
  }
  if (connections.length != 1) {
    return ApiResponses.internalServerError()
  }
  const connection = connections[0]
  if ((connection as unknown as OIDCSSORecord).oidcProvider) {
    await apiController.updateOIDCConnection({
      clientID: route.params.clientId,
      clientSecret: connection.clientSecret,
      product: connection.product,
      redirectUrl,
      defaultRedirectUrl,
      tenant,
    })
  } else {
    await apiController.updateSAMLConnection({
      clientID: route.params.clientId,
      clientSecret: connection.clientSecret,
      product: connection.product,
      redirectUrl,
      defaultRedirectUrl,
      tenant,
    })
  }
  return ApiResponses.success()
})
