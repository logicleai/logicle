import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getConversation } from '@/models/conversation'
import { db } from 'db/database'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const feedbackItemSchema = z.object({
  messageId: z.string(),
  feedback: z.enum(['like', 'dislike']),
  comment: z.string().nullable(),
})

export const GET = operation({
  name: 'List conversation feedbacks',
  description: 'Get all message feedbacks for a conversation (owned by the session user).',
  authentication: 'user',
  responses: [
    responseSpec(200, feedbackItemSchema.array()),
    errorSpec(403),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session }) => {
    const conversation = await getConversation(params.conversationId)
    if (!conversation) {
      return notFound(`No conversation with id ${params.conversationId}`)
    }
    if (conversation.ownerId !== session.userId) {
      return forbidden()
    }
    const rows = await db
      .selectFrom('MessageFeedback')
      .select(['messageId', 'positive', 'comment'])
      .where('userId', '=', session.userId)
      .where(
        'messageId',
        'in',
        db
          .selectFrom('Message')
          .select('id')
          .where('conversationId', '=', params.conversationId)
      )
      .execute()
    return ok(rows.map((r) => ({ messageId: r.messageId, feedback: (r.positive ? 'like' : 'dislike') as 'like' | 'dislike', comment: r.comment })))
  },
})
