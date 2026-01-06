import { route, operation } from '@/lib/routes'
import { getAssistantsWithOwner } from '@/models/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List my assistants',
    description: 'List assistants created by the current user.',
    authentication: 'user',
    implementation: async (_req: Request, _params, { session }) => {
      return await getAssistantsWithOwner({ userId: session.userId })
    },
  }),
})
