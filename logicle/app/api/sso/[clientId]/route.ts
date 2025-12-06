import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateConnectionParams } from '@boxyhq/saml-jackson'
import { findIdentityProvidersRaw } from '@/lib/auth/saml'
import { db } from '@/db/database'

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
  const identityProvider = findIdentityProvidersRaw(params.clientId)
  if (!identityProvider) {
    return ApiResponses.noSuchEntity()
  }
  // FIXME: will work after migrating to ids
  await db.deleteFrom('JacksonStore').where('key', '=', params.clientId).execute()
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, params: { clientId: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { redirectUrl, defaultRedirectUrl, name, description } =
    (await req.json()) as UpdateConnectionParams
  const connection = await findIdentityProvidersRaw(params.clientId)
  if (!connection) {
    return ApiResponses.noSuchEntity()
  }
  throw new Error('Not implemented')
  return ApiResponses.success()
})
