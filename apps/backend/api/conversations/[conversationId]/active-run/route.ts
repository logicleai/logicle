import { getActiveChatRunForConversation } from '@/backend/lib/chat/chatRuns'
import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getConversation } from '@/models/conversation'
import * as dto from '@/types/dto'

export const GET = operation({
  name: 'Get active chat run',
  description: 'Fetch the active in-memory chat run for a conversation.',
  authentication: 'user',
  responses: [responseSpec(200, dto.activeChatRunResponseSchema), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return notFound(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId !== session.userId) {
      return forbidden()
    }
    return ok({ run: getActiveChatRunForConversation(params.conversationId) ?? null })
  },
})
