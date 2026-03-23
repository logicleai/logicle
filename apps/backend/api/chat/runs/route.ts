import { conflict, error, operation, responseSpec, errorSpec } from '@/lib/routes'
import * as dto from '@/types/dto'
import { startServerChatRun } from '@/backend/lib/chat/startServerChatRun'

export const POST = operation({
  name: 'Create chat run',
  description: 'Start a server-side chat run for a conversation.',
  authentication: 'user',
  requestBodySchema: dto.messageSchema,
  responses: [responseSpec(201, dto.chatRunSchema), errorSpec(400), errorSpec(403), errorSpec(409)] as const,
  implementation: async ({ body, headers, session }) => {
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
    return { status: 201 as const, body: result.run }
  },
})
