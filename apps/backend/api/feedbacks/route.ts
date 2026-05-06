import { db } from '@/db/database'
import { errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const feedbackQuerySchema = z.object({
  feedback: z.enum(['like', 'dislike']).optional(),
  assistantIds: z.string().optional(),
  conversationIds: z.string().optional(),
  userIds: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const feedbackRecordSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  assistantId: z.string(),
  assistantName: z.string().nullable(),
  userId: z.string(),
  feedback: z.enum(['like', 'dislike']),
  comment: z.string().nullable(),
  messageRole: z.string(),
  messageContent: z.string(),
  messageSentAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const feedbackSearchResponseSchema = z.object({
  items: feedbackRecordSchema.array(),
  limit: z.number(),
  offset: z.number(),
  nextOffset: z.number().nullable(),
})

const parseIds = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0) ?? []

export const GET = operation({
  name: 'List message feedbacks',
  description: 'List and filter thumbs up/down feedback left on assistant messages for reporting.',
  authentication: 'admin',
  querySchema: feedbackQuerySchema,
  responses: [responseSpec(200, feedbackSearchResponseSchema), errorSpec(400)] as const,
  implementation: async ({ query }) => {
    const limit = query.limit ?? 100
    const offset = query.offset ?? 0
    const assistantIds = parseIds(query.assistantIds)
    const conversationIds = parseIds(query.conversationIds)
    const userIds = parseIds(query.userIds)

    let feedbackQuery = db
      .selectFrom('MessageFeedback')
      .innerJoin('Message', 'Message.id', 'MessageFeedback.messageId')
      .innerJoin('Conversation', 'Conversation.id', 'Message.conversationId')
      .leftJoin('Assistant', 'Assistant.id', 'Conversation.assistantId')
      .leftJoin('AssistantVersion', 'AssistantVersion.id', 'Assistant.publishedVersionId')
      .select([
        'MessageFeedback.messageId',
        'MessageFeedback.userId',
        'MessageFeedback.positive',
        'MessageFeedback.comment',
        'MessageFeedback.createdAt',
        'MessageFeedback.updatedAt',
        'Message.conversationId',
        'Message.role as messageRole',
        'Message.content as messageContent',
        'Message.sentAt as messageSentAt',
        'Conversation.assistantId',
        'AssistantVersion.name as assistantName',
      ])
      .orderBy('MessageFeedback.updatedAt', 'desc')
      .offset(offset)
      .limit(limit + 1)

    if (query.feedback) {
      feedbackQuery = feedbackQuery.where('MessageFeedback.positive', '=', query.feedback === 'like' ? 1 : 0)
    }
    if (assistantIds.length > 0) {
      feedbackQuery = feedbackQuery.where('Conversation.assistantId', 'in', assistantIds)
    }
    if (conversationIds.length > 0) {
      feedbackQuery = feedbackQuery.where('Message.conversationId', 'in', conversationIds)
    }
    if (userIds.length > 0) {
      feedbackQuery = feedbackQuery.where('MessageFeedback.userId', 'in', userIds)
    }
    if (query.from) {
      feedbackQuery = feedbackQuery.where('MessageFeedback.createdAt', '>=', query.from)
    }
    if (query.to) {
      feedbackQuery = feedbackQuery.where('MessageFeedback.createdAt', '<', query.to)
    }

    const rows = await feedbackQuery.execute()
    const items = rows.slice(0, limit).map((row) => ({
      messageId: row.messageId,
      conversationId: row.conversationId,
      assistantId: row.assistantId,
      assistantName: row.assistantName ?? null,
      userId: row.userId,
      feedback: (row.positive ? 'like' : 'dislike') as 'like' | 'dislike',
      comment: row.comment,
      messageRole: row.messageRole,
      messageContent: row.messageContent,
      messageSentAt: row.messageSentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return ok({
      items,
      limit,
      offset,
      nextOffset: rows.length > limit ? offset + limit : null,
    })
  },
})
