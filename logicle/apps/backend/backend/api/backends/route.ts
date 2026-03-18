import env from '@/lib/env'
import { createBackend, getBackends } from '@/models/backend'
import { protectApiKey } from '@/types/secure'
import { backendSchema, insertableBackendSchema } from '@/types/dto/backend'
import { error, forbidden, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List backends',
    description: 'List available backends (without secrets).',
    authentication: 'user',
    responses: [responseSpec(200, backendSchema.array())] as const,
    implementation: async () => {
      const backends = await getBackends()
      return ok(backends.map(protectApiKey))
    },
  }),
  POST: operation({
    name: 'Create backend',
    description: 'Create a new backend configuration.',
    authentication: 'admin',
    requestBodySchema: insertableBackendSchema,
    responses: [responseSpec(201, backendSchema), errorSpec(403), errorSpec(500)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      if (env.backends.locked) {
        return forbidden('Unable to create the backen: configuration locked')
      }
      try {
        const created = await createBackend(requestBody)
        return ok(created, 201)
      } catch {
        return error(500, 'Creation failed')
      }
    },
  }),
})
