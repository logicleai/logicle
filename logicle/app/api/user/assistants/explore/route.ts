import { route, operation } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List published assistants',
    description: 'List published assistants visible to the current user.',
    authentication: 'user',
    implementation: async (_req: Request, _params, { session }) => {
      const assistants = await getUserAssistants(
        {
          userId: session.userId,
        },
        'published'
      )
      return assistants
    },
  }),
})
