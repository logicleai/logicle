import ApiResponses from '@/app/api/utils/ApiResponses'
import { operation, route } from '@/lib/routes'
import { getBackend } from '@/models/backend'
import { llmModels } from '@/lib/models'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List models for backend',
    description: 'List available models for a backend.',
    authentication: 'user',
    implementation: async (_req: Request, params: { backendId: string }, _ctx) => {
      const backend = await getBackend(params.backendId)
      if (!backend) {
        return ApiResponses.noSuchEntity()
      }
      return llmModels.filter((m) => m.id === backend.providerType)
    },
  }),
})
