import { ok, operation, responseSpec } from '@/lib/routes'
import { getUserAssistants } from '@/models/assistant'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const exploreAssistantsQuerySchema = z.object({
  includeHidden: z.coerce.boolean().optional(),
})

export const GET = operation({
  name: 'List published assistants',
  description: 'List published assistants visible to the current user.',
  authentication: 'user',
  querySchema: exploreAssistantsQuerySchema,
  responses: [responseSpec(200, dto.userAssistantSchema.array())] as const,
  implementation: async ({ session, query }) => {
    const assistants = await getUserAssistants(
      {
        userId: session.userId,
      },
      'published'
    )
    return ok(query.includeHidden ? assistants : assistants.filter((assistant) => !assistant.hidden))
  },
})
