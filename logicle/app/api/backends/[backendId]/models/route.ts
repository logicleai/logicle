import { notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { getBackend } from '@/models/backend'
import { llmModels } from '@/lib/models'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List models for backend',
    description: 'List available models for a backend.',
    authentication: 'user',
    responses: [
      responseSpec(
        200,
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            providerType: z.string(),
          })
        )
      ),
      responseSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return notFound()
      }
      return ok(
        llmModels
          .filter((m) => m.id === backend.providerType)
          .map((m) => ({ id: m.id, name: m.name, providerType: String(backend.providerType) }))
      )
    },
  }),
})
