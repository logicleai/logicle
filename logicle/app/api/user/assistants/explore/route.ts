import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List published assistants',
    description: 'List published assistants visible to the current user.',
    authentication: 'user',
    responses: [responseSpec(200, dto.userAssistantSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const assistants = await getUserAssistants(
        {
          userId: session.userId,
        },
        'published'
      )
      return ok(assistants)
    },
  }),
})
