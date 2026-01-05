import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = requireAdmin(async (_req: Request, params: { id: string }) => {
  const connection = await findIdpConnection(params.id)
  if (!connection) {
    return ApiResponses.noSuchEntity()
  }
  return NextResponse.json(connection)
})

export const DELETE = requireAdmin(async (_req: Request, params: { id: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const identityProvider = findIdpConnection(params.id)
  if (!identityProvider) {
    return ApiResponses.noSuchEntity()
  }
  await deleteIdpConnection(params.id)
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, params: { id: string }) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const idp = await findIdpConnection(params.id)
  if (!idp) {
    return ApiResponses.noSuchEntity()
  }

  const result = updateableSsoConnectionSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  await db.updateTable('IdpConnection').set(result.data).where('id', '=', params.id).execute()
  return ApiResponses.success()
})
