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

const usageQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  workspaceId: z.string().optional(),
  userIds: z.string().optional(),
})

export const GET = operation({
  name: 'Get usage',
  description: 'Fetch usage aggregates for a given period.',
  authentication: 'admin',
  querySchema: usageQuerySchema,
  responses: [
    responseSpec(
      200,
      z.object({
        period: z.enum(['last_week', 'last_month', 'last_year', 'custom']),
        granularity: z.enum(['hour', 'day', 'week', 'month']),
        from: z.string(),
        to: z.string(),
        buckets: z
          .object({
            start: z.string(),
            end: z.string(),
            tokens: z.number(),
            messages: z.number(),
          })
          .array(),
      })
    ),
    errorSpec(400),
  ] as const,
  implementation: async (_req: Request, _params, { query }) => {
    const range = getAnalyticsRangeFromQuery(query)
    if (!range) {
      return error(400, 'Invalid analytics range')
    }
    const workspaceId = query.workspaceId
    const userIds = parseUserIdsParam(query.userIds ?? null)

    const buckets = buildBuckets(range)

    const makeRangeQuery = (from: string, to: string) => {
      let query = db
        .selectFrom('MessageAudit')
        .select(sql.lit(from).as('start'))
        .select(sql.lit(to).as('end'))
        .select((eb) => eb.fn.sum('tokens').as('tokens'))
        .select((eb) => eb.fn.countAll().as('messages'))
        .where((eb) =>
          eb.and([eb('MessageAudit.sentAt', '>=', from), eb('MessageAudit.sentAt', '<', to)])
        )
        .where((eb) => eb('MessageAudit.type', '=', 'user'))

      if (workspaceId) {
        query = query.where('MessageAudit.userId', 'in', (eb) =>
          eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
        )
      }

      if (userIds.length > 0) {
        query = query.where('MessageAudit.userId', 'in', userIds)
      }

      return query
    }

    let usageQuery = makeRangeQuery(
      formatDateTime(buckets[0].start),
      formatDateTime(buckets[0].end)
    )
    for (let i = 1; i < buckets.length; i++) {
      const bucket = buckets[i]
      usageQuery = usageQuery.union(
        makeRangeQuery(formatDateTime(bucket.start), formatDateTime(bucket.end))
      )
    }
    const result = (await usageQuery.execute())
      .map((row) => {
        return {
          ...row,
          messages: Number(row.messages ?? 0),
          tokens: Number(row.tokens ?? 0),
        }
      })
      .sort((a, b) => a.start.localeCompare(b.start))

    return ok({
      period: range.period,
      granularity: range.granularity,
      from: formatDateTime(range.start),
      to: formatDateTime(range.end),
      buckets: result,
    })
  },
})
