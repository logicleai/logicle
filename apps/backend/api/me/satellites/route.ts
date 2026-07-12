import { ok, operation, responseSpec } from '@/lib/routes'
import { getUserSatellites, createSatellite } from '@/models/satellite'
import { getUserById } from '@/models/user'
import { satelliteListItemSchema, satelliteSchema, insertableSatelliteSchema } from '@/types/dto'
import { hub } from '@/lib/satellite/hub'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List my satellites',
  description: 'Fetch all satellites owned by the current user, merged with live connection state.',
  authentication: 'user',
  responses: [responseSpec(200, satelliteListItemSchema.array())] as const,
  implementation: async ({ session }) => {
    const satellites = await getUserSatellites(session.userId)
    const connections = Array.from(hub.connections.values()).filter((conn) => conn.userId === session.userId)
    const connectionsById = new Map(connections.map((conn) => [conn.satelliteId, conn]))
    const owner = await getUserById(session.userId)
    const ownerName = owner?.name ?? null

    const registered = satellites.map((satellite) => {
      const connection = connectionsById.get(satellite.id)
      return {
        id: satellite.id,
        name: satellite.name,
        kind: 'registered' as const,
        connected: !!connection,
        ownerName,
        createdAt: satellite.createdAt,
        updatedAt: satellite.updatedAt,
      }
    })

    const ephemeral = connections
      .filter((conn) => conn.kind === 'ephemeral')
      .map((conn) => ({
        id: conn.satelliteId,
        name: conn.name,
        kind: 'ephemeral' as const,
        connected: true,
        ownerName,
        createdAt: conn.connectedAt.toISOString(),
        updatedAt: conn.connectedAt.toISOString(),
      }))

    return ok([...registered, ...ephemeral])
  },
})

export const POST = operation({
  name: 'Create a new satellite',
  description: 'Create a new satellite.',
  authentication: 'user',
  requestBodySchema: insertableSatelliteSchema,
  responses: [responseSpec(201, satelliteSchema)] as const,
  implementation: async ({ session, body }) => {
    const { satellite, secret } = await createSatellite(session.userId, body)
    return ok({ ...satellite, secret }, 201)
  },
})
