import { ok, operation, responseSpec } from '@/lib/routes'
import { z } from 'zod'
import { hub } from '@/lib/satellite/hub'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List connected satellites',
  description: 'Get list of currently connected satellites.',
  authentication: 'user',
  responses: [
    responseSpec(
      200,
      z.array(
        z.object({
          satelliteId: z.string(),
          satelliteName: z.string(),
        })
      )
    ),
  ] as const,
  implementation: async ({ session }) => {
    const connected = Array.from(hub.connections.values())
      .filter((conn) => conn.userId === session.userId)
      .map((conn) => ({
        satelliteId: conn.satelliteId,
        satelliteName: conn.name,
      }))

    return ok(connected)
  },
})
