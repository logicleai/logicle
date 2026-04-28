import { db } from '@/db/database'
import { error, errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import {
  formatDateTime,
  getAnalyticsRangeFromQuery,
  parseUserIdsParam,
} from '@/app/api/analytics/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const activityByUserQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().optional(),
  workspaceId: z.string().optional(),
  userIds: z.string().optional(),
  assistantIds: z.string().optional(),
})

export const GET = operation({
  name: 'Get activity by user',
  description: 'Fetch user activity aggregates for a given period.',
  authentication: 'admin',
  querySchema: activityByUserQuerySchema,
  responses: [
    responseSpec(
      200,
      z
        .object({
          userId: z.string().nullable(),
          name: z.string().nullable(),
          tokens: z.number(),
          messages: z.number(),
        })
        .array()
    ),
    errorSpec(400),
  ] as const,
  implementation: async ({ query }) => {
    const limit = query.limit
    const workspaceId = query.workspaceId
    const userIds = parseUserIdsParam(query.userIds ?? null)
    const assistantIds = parseUserIdsParam(query.assistantIds ?? null)
    const range = getAnalyticsRangeFromQuery(query)
    if (!range) {
      return error(400, 'Invalid analytics range')
    }
    let activityByUserQuery = db
      .selectFrom('MessageAudit')
      .leftJoin('User', (join) => join.onRef('MessageAudit.userId', '=', 'User.id'))
      .select('userId')
      .select('User.name')
      .select((eb) => eb.fn.sum('tokens').as('tokens'))
      .select((eb) => eb.fn.countAll().as('messages'))
      .groupBy(['userId', 'User.name'])
      .where((eb) => eb('MessageAudit.sentAt', '>=', formatDateTime(range.start)))
      .where((eb) => eb('MessageAudit.sentAt', '<', formatDateTime(range.end)))
      .where((eb) => eb('MessageAudit.type', '=', 'user'))

    if (workspaceId) {
      activityByUserQuery = activityByUserQuery.where('MessageAudit.userId', 'in', (eb) =>
        eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
      )
    }

    if (userIds.length > 0) {
      activityByUserQuery = activityByUserQuery.where('MessageAudit.userId', 'in', userIds)
    }

    if (assistantIds.length > 0) {
      activityByUserQuery = activityByUserQuery.where(
        'MessageAudit.assistantId',
        'in',
        assistantIds
      )
    }
    if (limit) {
      activityByUserQuery = activityByUserQuery.limit(10)
    }
    activityByUserQuery = activityByUserQuery.orderBy('messages', 'desc')
    const rows = await activityByUserQuery.execute()
    const normalized = rows.map((row) => {
      return {
        ...row,
        tokens: Number(row.tokens),
        messages: Number(row.messages),
      }
    })
    return ok(normalized)
  },
})
