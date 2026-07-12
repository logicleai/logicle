import { ok, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite, regenerateSatelliteSecret } from '@/models/satellite'
import { satelliteSchema } from '@/types/dto'
import { connections } from '@/lib/satellite/hub'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Regenerate satellite secret',
  description: 'Generate a new connection secret for a satellite, invalidating the previous one.',
  authentication: 'user',
  responses: [responseSpec(200, satelliteSchema), errorSpec(404)] as const,
  implementation: async ({ session, params }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    const { satellite: updated, secret } = await regenerateSatelliteSecret(params.id, session.userId)
    connections.get(params.id)?.socket.close(1008, 'Secret rotated')
    return ok({ ...updated, secret })
  },
})
