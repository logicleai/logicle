import { ok, operation, responseSpec } from '@/lib/routes'
import { hub } from '@/lib/satellite/hub'
import { getAllSatellites } from '@/models/satellite'
import { satelliteListItemSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List all satellites',
  description: 'Admin: list all registered satellites and live ephemeral connections.',
  authentication: 'admin',
  responses: [responseSpec(200, satelliteListItemSchema.array())] as const,
  implementation: async () => {
    const satellites = await getAllSatellites()
    const connectionsById = new Map(
      Array.from(hub.connections.values()).map((conn) => [conn.satelliteId, conn])
    )

    const registered = satellites.map((satellite) => ({
      id: satellite.id,
      name: satellite.name,
      kind: 'registered' as const,
      connected: connectionsById.has(satellite.id),
      createdAt: satellite.createdAt,
      updatedAt: satellite.updatedAt,
    }))

    const ephemeral = Array.from(hub.connections.values())
      .filter((conn) => conn.kind === 'ephemeral')
      .map((conn) => ({
        id: conn.satelliteId,
        name: conn.name,
        kind: 'ephemeral' as const,
        connected: true,
        createdAt: conn.connectedAt.toISOString(),
        updatedAt: conn.connectedAt.toISOString(),
      }))

    return ok([...registered, ...ephemeral])
  },
})
