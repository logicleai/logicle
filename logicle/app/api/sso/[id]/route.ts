import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateConnectionParams } from '@boxyhq/saml-jackson'
import { findIdentityProvidersRaw } from '@/lib/auth/saml'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = requireAdmin(async (_req: Request, params: { id: string }) => {
  const connection = await findIdentityProvidersRaw(params.id)
  if (!connection) {
    return ApiResponses.noSuchEntity()
  }
  return NextResponse.json(connection)
})

export const DELETE = requireAdmin(async (_req: Request, params: { id: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const identityProvider = findIdentityProvidersRaw(params.id)
  if (!identityProvider) {
    return ApiResponses.noSuchEntity()
  }
  await db.deleteFrom('JacksonStore').where('key', '=', params.id).execute()
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, params: { id: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { redirectUrl, defaultRedirectUrl, name, description } =
    (await req.json()) as UpdateConnectionParams
  const idp = await findIdentityProvidersRaw(params.id)
  if (!idp) {
    return ApiResponses.noSuchEntity()
  }
  if (defaultRedirectUrl) idp.data.defaultRedirectUrl = defaultRedirectUrl
  if (redirectUrl) idp.data.redirectUrl = redirectUrl
  if (name) idp.data.name = name
  await db
    .updateTable('JacksonStore')
    .set('value', JSON.stringify(idp.data))
    .where('key', '=', params.id)
    .execute()
  return ApiResponses.success()
})
