import { ok, noBody, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite, deleteSatellite, updateSatellite } from '@/models/satellite'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

const hideSecret = (satellite: dto.Satellite): dto.Satellite => ({
  ...satellite,
  secret: satellite.secret ? '<hidden>' : null,
})

export const GET = operation({
  name: 'Get satellite details',
  description: 'Fetch details for a specific satellite.',
  authentication: 'user',
  responses: [responseSpec(200, dto.satelliteSchema), errorSpec(404)] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    return ok(hideSecret(satellite))
  },
})

export const DELETE = operation({
  name: 'Delete satellite',
  description: 'Delete a satellite.',
  authentication: 'user',
  responses: [responseSpec(204), errorSpec(404)] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    await deleteSatellite(params.id, session.userId)
    return noBody()
  },
})

export const PATCH = operation({
  name: 'Update satellite',
  description: 'Update a satellite.',
  authentication: 'user',
  requestBodySchema: dto.updateableSatelliteSchema,
  responses: [responseSpec(200, dto.satelliteSchema), errorSpec(404)] as const,
  implementation: async ({ session, params, body }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    const updatedSatellite = await updateSatellite(params.id, session.userId, body)
    return ok(hideSecret(updatedSatellite))
  },
})
