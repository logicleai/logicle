import { ok, operation, responseSpec, route } from '@/lib/routes'

export const { GET } = route({
  GET: operation({
    name: 'Healthcheck',
    description: 'Simple health status endpoint.',
    authentication: 'public',
    responses: [responseSpec(200)] as const,
    implementation: async () => {
      return ok({
        status: 'ok',
      })
    },
  }),
})
