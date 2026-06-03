import { ok, operation, responseSpec, notFound } from '@/lib/routes'
import { getSatellite, deleteSatellite } from '@/models/satellite'
import { satelliteSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get satellite details',
  description: 'Fetch details for a specific satellite.',
  authentication: 'user',
  responses: [responseSpec(200, satelliteSchema), responseSpec(404, notFound())] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    return ok(satellite)
  },
})

export const DELETE = operation({
  name: 'Delete satellite',
  description: 'Delete a satellite.',
  authentication: 'user',
  responses: [responseSpec(204), responseSpec(404, notFound())] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    await deleteSatellite(params.id, session.userId)
    return ok(null, 204)
  },
})
