import { createChatRunEventsResponse } from '@/backend/lib/chat/chatRunEventsResponse'
import { startServerChatRun } from '@/backend/lib/chat/startServerChatRun'
import { conflict, error, operation, responseSpec, errorSpec } from '@/lib/routes'
import * as dto from '@/types/dto'
import { messageSchema } from '@/types/dto'

export const POST = operation({
  name: 'Chat',
  description: 'Send a message to a conversation and stream assistant response.',
  authentication: 'user',
  requestBodySchema: messageSchema,
  responses: [responseSpec(200), errorSpec(400), errorSpec(403), errorSpec(409)] as const,
  implementation: async ({ body, headers, session, signal }) => {
    const result = await startServerChatRun({
      userMessage: body,
      headers,
      session,
    })
    if (!result.ok) {
      if (result.status === 400) {
        return error(400, result.message, result.values)
      }
      if (result.status === 403) {
        return error(403, result.message, result.values)
      }
      if (result.status === 409) {
        return conflict(result.message, result.values)
      }
    }

    return createChatRunEventsResponse({
      runId: result.run.id,
      signal,
    })
  },
})
