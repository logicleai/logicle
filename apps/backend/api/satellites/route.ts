import { ok, operation, responseSpec, route } from '@/lib/routes'
import * as satelliteHub from '@/lib/satelliteHub'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List satellites',
    description: 'List satellite connections.',
    authentication: 'user',
    responses: [
      responseSpec(
        200,
        z
          .object({
            name: z.string(),
            tools: z.array(z.any()),
          })
          .array()
      ),
    ] as const,
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
