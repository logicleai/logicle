import { ok, operation, responseSpec, route } from '@/lib/routes'
import * as satelliteHub from '@/lib/satelliteHub'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List satellites',
    description: 'List satellite connections.',
    authentication: 'user',
    responses: [responseSpec(200)] as const,
    implementation: async () => {
      const result = Array.from(satelliteHub.connections.values()).map((conn) => {
        return {
          name: conn.name,
          tools: conn.tools,
        }
      })
      return ok(result)
    },
  }),
})
