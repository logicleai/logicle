import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getAssistantsWithOwner } from '@/models/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List my assistants',
    description: 'List assistants created by the current user.',
    authentication: 'user',
    responses: [responseSpec(200)] as const,
    implementation: async (_req: Request, _params, { session }) => {
      return ok(await getAssistantsWithOwner({ userId: session.userId }))
    },
  }),
})
