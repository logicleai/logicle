import ApiResponses from '@/api/utils/ApiResponses'
import env from '@/lib/env'
import { createBackend, getBackends } from '@/models/backend'
import { protectApiKey } from '@/types/secure'
import { insertableBackendSchema } from '@/types/dto/backend'
import { operation, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List backends',
    description: 'List available backends (without secrets).',
    authentication: 'user',
    implementation: async () => {
      const backends = await getBackends()
      return backends.map(protectApiKey)
    },
  }),
  POST: operation({
    name: 'Create backend',
    description: 'Create a new backend configuration.',
    authentication: 'admin',
    requestBodySchema: insertableBackendSchema,
    implementation: async (_req: Request, _params, { requestBody }) => {
      if (env.backends.locked) {
        return ApiResponses.forbiddenAction('Unable to create the backen: configuration locked')
      }
      try {
        const created = await createBackend(requestBody)
        return ApiResponses.created(created)
      } catch {
        return ApiResponses.internalServerError('Creation failed')
      }
    },
  }),
})
