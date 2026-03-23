import { db } from '@/db/database'
import { error, errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import {
  formatDateTime,
  getAnalyticsRangeFromQuery,
  parseUserIdsParam,
} from '@/app/api/analytics/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const activityByAssistantQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().optional(),
  workspaceId: z.string().optional(),
  userIds: z.string().optional(),
})

export const GET = operation({
  name: 'Get activity by assistant',
  description: 'Fetch assistant activity aggregates for a given period.',
  authentication: 'admin',
  querySchema: activityByAssistantQuerySchema,
  responses: [
    responseSpec(
      200,
      z
        .object({
          assistantId: z.string().nullable(),
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
    const range = getAnalyticsRangeFromQuery(query)
    if (!range) {
      return error(400, 'Invalid analytics range')
    }
    let q = db
      .selectFrom('MessageAudit')
      .leftJoin('Assistant', (join) =>
        join.onRef('Assistant.id', '=', 'MessageAudit.assistantId')
      )
      .leftJoin('AssistantVersion', (join) =>
        join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
      )
      .select('MessageAudit.assistantId')
      .select('AssistantVersion.name')
      .select((eb) => eb.fn.sum('tokens').as('tokens'))
      .select((eb) => eb.fn.countAll().as('messages'))
      .groupBy(['MessageAudit.assistantId', 'AssistantVersion.name'])
      .where((eb) => eb('MessageAudit.sentAt', '>=', formatDateTime(range.start)))
      .where((eb) => eb('MessageAudit.sentAt', '<', formatDateTime(range.end)))
      .where((eb) => eb('MessageAudit.type', '=', 'user'))

    if (workspaceId) {
      q = q.where('MessageAudit.userId', 'in', (eb) =>
        eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
      )
    }

    if (userIds.length > 0) {
      q = q.where('MessageAudit.userId', 'in', userIds)
    }

    if (limit) {
      q = q.limit(10)
    }

    q = q.orderBy('messages', 'desc')

    const rows = await q.execute()
    return ok(
      rows.map((row) => ({
        assistantId: row.assistantId,
        name: row.name ?? null,
        tokens: Number(row.tokens),
        messages: Number(row.messages),
      }))
    )
  },
})
