import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getAssistantVersions } from '@/models/assistant'
import { assistantVersionSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List assistant versions',
    description: 'Fetch version history for an assistant.',
    authentication: 'user',
    responses: [responseSpec(200, assistantVersionSchema.array())] as const,
    implementation: async (_req: Request, params: { assistantId: string }) => {
      const versions = await getAssistantVersions(params.assistantId)
      return ok(versions)
    },
  }),
})
