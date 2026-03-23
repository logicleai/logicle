import { db } from '@/db/database'
import { sql } from 'kysely'
import { error, errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import {
  buildBuckets,
  formatDateTime,
  getAnalyticsRangeFromQuery,
  parseUserIdsParam,
} from '@/app/api/analytics/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const usageByAssistantQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  workspaceId: z.string().optional(),
  userIds: z.string().optional(),
})

const breakdownRowSchema = z.object({
  start: z.string(),
  end: z.string(),
  id: z.string().nullable(),
  name: z.string().nullable(),
  tokens: z.number(),
  messages: z.number(),
})

export const GET = operation({
  name: 'Get usage by assistant',
  description: 'Fetch usage time-series broken down by assistant for a given period.',
  authentication: 'admin',
  querySchema: usageByAssistantQuerySchema,
  responses: [
    responseSpec(
      200,
      z.object({
        period: z.enum(['last_week', 'last_month', 'last_year', 'custom']),
        granularity: z.enum(['hour', 'day', 'week', 'month']),
        from: z.string(),
        to: z.string(),
        rows: breakdownRowSchema.array(),
      })
    ),
    errorSpec(400),
  ] as const,
  implementation: async ({ query }) => {
    const range = getAnalyticsRangeFromQuery(query)
    if (!range) {
      return error(400, 'Invalid analytics range')
    }
    const workspaceId = query.workspaceId
    const userIds = parseUserIdsParam(query.userIds ?? null)

    const buckets = buildBuckets(range)

    const makeRangeQuery = (from: string, to: string) => {
      let q = db
        .selectFrom('MessageAudit')
        .leftJoin('Assistant', (join) =>
          join.onRef('Assistant.id', '=', 'MessageAudit.assistantId')
        )
        .leftJoin('AssistantVersion', (join) =>
          join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
        )
        .select(sql.lit(from).as('start'))
        .select(sql.lit(to).as('end'))
        .select('MessageAudit.assistantId as id')
        .select('AssistantVersion.name')
        .select((eb) => eb.fn.sum('tokens').as('tokens'))
        .select((eb) => eb.fn.countAll().as('messages'))
        .where((eb) =>
          eb.and([eb('MessageAudit.sentAt', '>=', from), eb('MessageAudit.sentAt', '<', to)])
        )
        .where((eb) => eb('MessageAudit.type', '=', 'user'))
        .groupBy(['MessageAudit.assistantId', 'AssistantVersion.name'])

      if (workspaceId) {
        q = q.where('MessageAudit.userId', 'in', (eb) =>
          eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
        )
      }

      if (userIds.length > 0) {
        q = q.where('MessageAudit.userId', 'in', userIds)
      }

      return q
    }

    let usageQuery = makeRangeQuery(
      formatDateTime(buckets[0].start),
      formatDateTime(buckets[0].end)
    )
    for (let i = 1; i < buckets.length; i++) {
      usageQuery = usageQuery.union(
        makeRangeQuery(formatDateTime(buckets[i].start), formatDateTime(buckets[i].end))
      )
    }

    const result = (await usageQuery.execute()).map((row) => ({
      start: row.start,
      end: row.end,
      id: row.id ?? null,
      name: row.name ?? null,
      messages: Number(row.messages ?? 0),
      tokens: Number(row.tokens ?? 0),
    }))

    return ok({
      period: range.period,
      granularity: range.granularity,
      from: formatDateTime(range.start),
      to: formatDateTime(range.end),
      rows: result,
    })
  },
})
