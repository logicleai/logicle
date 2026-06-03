import { ok, operation, responseSpec } from '@/lib/routes'
import { getUserSatellites, createSatellite } from '@/models/satellite'
import { satelliteSchema, insertableSatelliteSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List my satellites',
  description: 'Fetch all satellites owned by the current user.',
  authentication: 'user',
  responses: [responseSpec(200, satelliteSchema.array())] as const,
  implementation: async ({ session }) => {
    const satellites = await getUserSatellites(session.userId)
    return ok(satellites)
  },
})

export const POST = operation({
  name: 'Create a new satellite',
  description: 'Create a new satellite.',
  authentication: 'user',
  requestBodySchema: insertableSatelliteSchema,
  responses: [responseSpec(201, satelliteSchema)] as const,
  implementation: async ({ session, body }) => {
    const satellite = await createSatellite(session.userId, body)
    return ok(satellite, 201)
  },
})
