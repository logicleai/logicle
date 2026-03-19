import {
  error,
  forbidden,
  noBody,
  notFound,
  ok,
  operation,
  responseSpec,
  errorSpec,
  route,
} from '@/lib/routes'
import { getConversation, getConversationMessage } from '@/models/conversation'
import { db } from 'db/database'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const feedbackSchema = z.object({
  feedback: z.enum(['like', 'dislike']),
  comment: z.string().nullable().optional(),
})

const feedbackResponseSchema = feedbackSchema.extend({
  messageId: z.string(),
  userId: z.string(),
})

export const { GET, PUT, DELETE } = route({
  GET: operation({
    name: 'Get message feedback',
    description: 'Get the feedback for a message in a conversation.',
    authentication: 'user',
    responses: [
      responseSpec(200, feedbackResponseSchema.nullable()),
      errorSpec(403),
      errorSpec(404),
    ] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const row = await db
        .selectFrom('MessageFeedback')
        .selectAll()
        .where('messageId', '=', params.messageId)
        .where('userId', '=', session.userId)
        .executeTakeFirst()
      return ok(
        row
          ? { messageId: row.messageId, userId: row.userId, feedback: (row.positive ? 'like' : 'dislike') as 'like' | 'dislike', comment: row.comment }
          : null
      )
    },
  }),
  PUT: operation({
    name: 'Set message feedback',
    description: 'Set thumbs up or down feedback for a message.',
    authentication: 'user',
    requestBodySchema: feedbackSchema,
    responses: [
      responseSpec(204),
      errorSpec(400),
      errorSpec(403),
      errorSpec(404),
      errorSpec(500),
    ] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session, requestBody }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      const message = await getConversationMessage(params.messageId)
      if (!message) {
        return notFound(`No message with id ${params.messageId}`)
      }
      if (message.conversationId !== conversation.id) {
        return error(400, `No such message in conversation`)
      }
      const now = new Date().toISOString()
      await db
        .insertInto('MessageFeedback')
        .values({
          messageId: params.messageId,
          userId: session.userId,
          positive: requestBody.feedback === 'like' ? 1 : 0,
          comment: requestBody.comment ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.columns(['messageId', 'userId']).doUpdateSet({
            positive: requestBody.feedback === 'like' ? 1 : 0,
            comment: requestBody.comment ?? null,
            updatedAt: now,
          })
        )
        .execute()
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete message feedback',
    description: 'Remove feedback for a message.',
    authentication: 'user',
    responses: [
      responseSpec(204),
      errorSpec(403),
      errorSpec(404),
    ] as const,
    implementation: async (
      _req: Request,
      params: { conversationId: string; messageId: string },
      { session }
    ) => {
      const conversation = await getConversation(params.conversationId)
      if (!conversation) {
        return notFound(`No conversation with id ${params.conversationId}`)
      }
      if (conversation.ownerId !== session.userId) {
        return forbidden()
      }
      await db
        .deleteFrom('MessageFeedback')
        .where('messageId', '=', params.messageId)
        .where('userId', '=', session.userId)
        .execute()
      return noBody()
    },
  }),
})
