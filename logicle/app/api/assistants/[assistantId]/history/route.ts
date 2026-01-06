import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { getAssistantVersions } from '@/models/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List assistant versions',
    description: 'Fetch version history for an assistant.',
    authentication: 'user',
    implementation: async (_req: Request, params: { assistantId: string }) => {
      const versions = await getAssistantVersions(params.assistantId)
      return ApiResponses.json(versions)
    },
  }),
})
