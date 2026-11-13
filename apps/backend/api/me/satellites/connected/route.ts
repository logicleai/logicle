import { ok, operation, responseSpec } from '@/lib/routes'
import { z } from 'zod'
import { filterVisibleSatelliteIds } from '@/models/satellite'
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
    const connections = Array.from(hub.connections.values())
    const visibleIds = await filterVisibleSatelliteIds(
      session,
      connections.filter((conn) => conn.kind === 'registered').map((conn) => conn.satelliteId)
    )
    const connected = connections
      .filter((conn) =>
        conn.kind === 'ephemeral'
          ? conn.userId === session.userId
          : visibleIds.has(conn.satelliteId)
      )
      .map((conn) => ({
        satelliteId: conn.satelliteId,
        satelliteName: conn.name,
      }))

    return ok(connected)
  },
})
