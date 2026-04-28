import { ok, operation, responseSpec } from '@/lib/routes'
import { getAssistantsWithOwner } from '@/models/assistant'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List my assistants',
  description: 'List assistants created by the current user.',
  authentication: 'user',
  responses: [responseSpec(200, dto.assistantWithOwnerSchema.array())] as const,
  implementation: async ({ session }) => {
    return ok(await getAssistantsWithOwner({ userId: session.userId }))
  },
})
