import { getBackendsWithModels } from '@/models/backend'
import { ok, operation, responseSpec, route } from '@/lib/routes'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List backends with models',
    description: 'List backends and their models.',
    authentication: 'user',
    responses: [
      responseSpec(
        200,
        z.array(
          z.object({
            backendId: z.string(),
            backendName: z.string(),
            models: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                providerType: z.string().optional(),
              })
            ),
          })
        )
      ),
    ] as const,
    implementation: async () => {
      const response: dto.BackendModels[] = await getBackendsWithModels()
      return ok(response)
    },
  }),
})
