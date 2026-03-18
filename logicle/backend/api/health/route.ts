import { ok, operation, responseSpec, route } from '@/lib/routes'
import { z } from 'zod'

export const { GET } = route({
  GET: operation({
    name: 'Healthcheck',
    description: 'Simple health status endpoint.',
    authentication: 'public',
    responses: [responseSpec(200, z.object({ status: z.string() }))] as const,
    implementation: async () => {
      return ok({
        status: 'ok',
      })
    },
  }),
})
