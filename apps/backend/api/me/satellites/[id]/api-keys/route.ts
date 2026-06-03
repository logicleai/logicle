import { ok, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite } from '@/models/satellite'
import { createSatelliteApiKey } from '@/models/apikey'
import { apiKeySchema } from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Create satellite API key',
  description: 'Create a new API key for a satellite.',
  authentication: 'user',
  requestBodySchema: z.object({
    label: z.string().optional(),
  }),
  responses: [responseSpec(201, apiKeySchema), errorSpec(404)] as const,
  implementation: async ({ session, params, body }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }
    const apiKey = await createSatelliteApiKey(session.userId, params.id, body.label)
    return ok(apiKey, 201)
  },
})
