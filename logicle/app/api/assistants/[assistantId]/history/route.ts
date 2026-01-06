import { route, operation } from '@/lib/routes'
import { getAssistantVersions } from '@/models/assistant'
import { assistantVersionSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List assistant versions',
    description: 'Fetch version history for an assistant.',
    authentication: 'user',
    responseBodySchema: assistantVersionSchema.array(),
    implementation: async (_req: Request, params: { assistantId: string }) => {
      const versions = await getAssistantVersions(params.assistantId)
      return versions
    },
  }),
})
