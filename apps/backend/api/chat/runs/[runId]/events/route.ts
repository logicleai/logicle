import { getChatRunById } from '@/backend/lib/chat/chatRuns'
import { createChatRunEventsResponse } from '@/backend/lib/chat/chatRunEventsResponse'
import { forbidden, notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import { z } from 'zod'

const querySchema = z.object({
  afterSequence: z.coerce.number().int().nonnegative().optional(),
})

export const GET = operation({
  name: 'Stream chat run events',
  description: 'Replay and stream live events for an active chat run.',
  authentication: 'user',
  querySchema,
  responses: [responseSpec(200), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, query, session, signal }) => {
    const run = getChatRunById(params.runId)
    if (!run) {
      return notFound('No such chat run')
    }
    if (run.ownerId !== session.userId) {
      return forbidden()
    }

    const afterSequence = query.afterSequence ?? 0
    return createChatRunEventsResponse({ runId: params.runId, afterSequence, signal })
  },
})
