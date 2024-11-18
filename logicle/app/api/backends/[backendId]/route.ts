import { deleteBackend, getBackend, updateBackend } from '@/models/backend'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { protectApiKey } from '@/types/secure'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import env from '@/lib/env'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async (req: Request, params: { backendId: string }) => {
  const backend = await getBackend(params.backendId) // Use the helper function
  if (!backend) {
    return ApiResponses.noSuchEntity()
  }
  return ApiResponses.json(protectApiKey(backend))
})

export const PATCH = requireAdmin(async (req: Request, params: { backendId: string }) => {
  if (env.backends.locked) {
    return ApiResponses.forbiddenAction('Unable to modify the backend: configuration locked')
  }
  const backend = await getBackend(params.backendId)
  if (!backend) {
    return ApiResponses.noSuchEntity('No such backend')
  }
  if (backend.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned backend")
  }
  const data = await req.json()
  await updateBackend(params.backendId, data)
  return ApiResponses.success()
})

export const DELETE = requireAdmin(async (req: Request, params: { backendId: string }) => {
  if (env.backends.locked) {
    return ApiResponses.forbiddenAction('Unable to delete the backend: configuration locked')
  }
  try {
    await deleteBackend(params.backendId)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
    ) {
      return ApiResponses.foreignKey('Backend is in use')
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})
