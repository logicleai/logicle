import { ok, noBody, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite, deleteSatellite, updateSatellite } from '@/models/satellite'
import { satelliteSchema, updateableSatelliteSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get satellite details',
  description: 'Admin: fetch details for any satellite.',
  authentication: 'admin',
  responses: [responseSpec(200, satelliteSchema), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite) {
      return notFound()
    }
    return ok({ ...satellite, secret: satellite.secret ? '<hidden>' : null })
  },
})

export const PATCH = operation({
  name: 'Update satellite',
  description: 'Admin: rename any satellite.',
  authentication: 'admin',
  requestBodySchema: updateableSatelliteSchema,
  responses: [responseSpec(200, satelliteSchema), errorSpec(404)] as const,
  implementation: async ({ params, body }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite) {
      return notFound()
    }
    const updated = await updateSatellite(params.id, satellite.userId, body)
    return ok({ ...updated, secret: updated.secret ? '<hidden>' : null })
  },
})

export const DELETE = operation({
  name: 'Delete satellite',
  description: 'Admin: delete any satellite.',
  authentication: 'admin',
  responses: [responseSpec(204), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite) {
      return notFound()
    }
    await deleteSatellite(params.id, satellite.userId)
    return noBody()
  },
})
