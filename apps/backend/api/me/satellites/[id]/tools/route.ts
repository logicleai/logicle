import { ok, operation, responseSpec, errorSpec, notFound } from '@/lib/routes'
import { getSatellite } from '@/models/satellite'
import { createSatelliteTools } from '@/models/satelliteTool'
import { satelliteToolSchema } from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Save discovered tools',
  description: 'Save tools from a connected satellite to the database.',
  authentication: 'user',
  requestBodySchema: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        inputSchema: z.record(z.string(), z.any()).optional(),
        outputSchema: z.record(z.string(), z.any()).optional(),
      })
    ),
  }),
  responses: [responseSpec(201, z.array(satelliteToolSchema)), errorSpec(404)] as const,
  implementation: async ({ session, params, body }) => {
    const satellite = await getSatellite(params.id)
    if (!satellite || satellite.userId !== session.userId) {
      return notFound()
    }

    const createdTools = await createSatelliteTools(params.id, body.tools)
    return ok(createdTools, 201)
  },
})
