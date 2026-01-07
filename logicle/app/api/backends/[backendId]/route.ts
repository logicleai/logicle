import env from '@/lib/env'
import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import {
  conflict,
  forbidden,
  noBody,
  notFound,
  ok,
  operation,
  responseSpec,
  route,
} from '@/lib/routes'
import { deleteBackend, getBackend, updateBackend } from '@/models/backend'
import { protectApiKey } from '@/types/secure'
import { backendSchema, updateableBackendSchema } from '@/types/dto/backend'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get backend',
    description: 'Fetch a backend by id.',
    authentication: 'admin',
    responses: [responseSpec(200, backendSchema), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return notFound('Backend not found')
      }
      return ok(protectApiKey(backend))
    },
  }),
  PATCH: operation({
    name: 'Update backend',
    description: 'Update an existing backend configuration.',
    authentication: 'admin',
    requestBodySchema: updateableBackendSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { backendId: string }, { requestBody }) => {
      if (env.backends.locked) {
        return forbidden('Unable to modify the backend: configuration locked')
      }
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return notFound('No such backend')
      }
      if (backend.provisioned) {
        return forbidden("Can't modify a provisioned backend")
      }
      await updateBackend(params.backendId, requestBody)
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete backend',
    description: 'Delete a backend configuration.',
    authentication: 'admin',
    responses: [
      responseSpec(204),
      responseSpec(403),
      responseSpec(404),
      responseSpec(409),
    ] as const,
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      if (env.backends.locked) {
        return forbidden('Unable to delete the backend: configuration locked')
      }
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return notFound('No such backend')
      }
      if (backend.provisioned) {
        return forbidden("Can't delete a provisioned backend")
      }
      try {
        await deleteBackend(params.backendId)
      } catch (e) {
        if (interpretDbException(e) === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY) {
          return conflict('Backend is in use')
        }
        throw e
      }
      return noBody()
    },
  }),
})
