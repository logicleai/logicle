import ApiResponses from '@/api/utils/ApiResponses'
import env from '@/lib/env'
import {
  KnownDbError,
  KnownDbErrorCode,
  interpretDbException,
} from '@/db/exception'
import { operation, route } from '@/lib/routes'
import { deleteBackend, getBackend, updateBackend } from '@/models/backend'
import { protectApiKey } from '@/types/secure'
import { updateableBackendSchema } from '@/types/dto/backend'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get backend',
    description: 'Fetch a backend by id.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return ApiResponses.noSuchEntity()
      }
      return protectApiKey(backend)
    },
  }),
  PATCH: operation({
    name: 'Update backend',
    description: 'Update an existing backend configuration.',
    authentication: 'admin',
    requestBodySchema: updateableBackendSchema,
    implementation: async (_req: Request, params: { backendId: string }, { requestBody }) => {
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
      await updateBackend(params.backendId, requestBody)
      return ApiResponses.success()
    },
  }),
  DELETE: operation({
    name: 'Delete backend',
    description: 'Delete a backend configuration.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      if (env.backends.locked) {
        return ApiResponses.forbiddenAction('Unable to delete the backend: configuration locked')
      }
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return ApiResponses.noSuchEntity('No such backend')
      }
      if (backend.provisioned) {
        return ApiResponses.forbiddenAction("Can't delete a provisioned backend")
      }
      try {
        await deleteBackend(params.backendId)
      } catch (e) {
        const interpretedException = interpretDbException(e)
        if (
          interpretedException instanceof KnownDbError &&
          interpretedException.code === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
        ) {
          return ApiResponses.foreignKey('Backend is in use')
        }
        throw interpretedException
      }
      return ApiResponses.success()
    },
  }),
})
