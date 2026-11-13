import { ok, operation, responseSpec, errorSpec, forbidden } from '@/lib/routes'
import { getVisibleSatellites, createSatellite, canSetSatelliteSharing } from '@/models/satellite'
import { getUserById } from '@/models/user'
import { satelliteListItemSchema, satelliteSchema, insertableSatelliteSchema } from '@/types/dto'
import { hub } from '@/lib/satellite/hub'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List my satellites',
  description: 'Fetch owned and shared satellites, merged with live connection state.',
  authentication: 'user',
  responses: [responseSpec(200, satelliteListItemSchema.array())] as const,
  implementation: async ({ session }) => {
    const satellites = await getVisibleSatellites(session)
    const visibleIds = new Set(satellites.map((satellite) => satellite.id))
    const connections = Array.from(hub.connections.values()).filter((conn) =>
      conn.kind === 'ephemeral' ? conn.userId === session.userId : visibleIds.has(conn.satelliteId)
    )
    const connectionsById = new Map(connections.map((conn) => [conn.satelliteId, conn]))
    const ownerIds = [
      ...new Set([session.userId, ...satellites.map((satellite) => satellite.userId)]),
    ]
    const owners = await Promise.all(ownerIds.map((id) => getUserById(id)))
    const ownerNames = new Map(
      owners.filter((owner) => owner !== undefined).map((owner) => [owner.id, owner.name])
    )

    const registered = satellites.map((satellite) => {
      const connection = connectionsById.get(satellite.id)
      return {
        id: satellite.id,
        name: satellite.name,
        kind: 'registered' as const,
        connected: !!connection,
        ownerName: ownerNames.get(satellite.userId) ?? null,
        canManage: satellite.userId === session.userId,
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
        ownerName: ownerNames.get(conn.userId) ?? null,
        canManage: false,
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
  responses: [responseSpec(201, satelliteSchema), errorSpec(403)] as const,
  implementation: async ({ session, body }) => {
    if (body.sharing && !(await canSetSatelliteSharing(session, body.sharing))) {
      return forbidden()
    }
    const { satellite, secret } = await createSatellite(session.userId, body)
    return ok({ ...satellite, secret }, 201)
  },
})
