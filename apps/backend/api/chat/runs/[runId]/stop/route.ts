import { getChatRunById, requestChatRunStop } from '@/backend/lib/chat/chatRuns'
import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import * as dto from '@/types/dto'

export const POST = operation({
  name: 'Stop chat run',
  description: 'Request stop for an active chat run.',
  authentication: 'user',
  responses: [responseSpec(200, dto.chatRunSchema), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const run = getChatRunById(params.runId)
    if (!run) {
      return notFound('No such chat run')
    }
    if (run.ownerId !== session.userId) {
      return forbidden()
    }
    return ok(requestChatRunStop(params.runId) ?? run)
  },
})
