import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'
import { userAssistantSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List my draft assistants',
    description: 'List draft assistants for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, userAssistantSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const assistants = await getUserAssistants(
        {
          userId: session.userId,
        },
        'draft'
      )
      return ok(assistants)
    },
  }),
})
