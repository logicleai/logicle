import { db } from '@/db/database'
import { error, ok, operation, responseSpec, route } from '@/lib/routes'
import { getAnalyticsRange, formatDateTime } from '@/app/api/analytics/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'Get activity by user',
    description: 'Fetch user activity aggregates for a given period.',
    authentication: 'admin',
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
    ] as const,
    implementation: async (req: Request) => {
      const url = new URL(req.url)
      const limit = url.searchParams.get('limit')
      const range = getAnalyticsRange(req)
      if (!range) {
        return error(400, 'Invalid analytics range')
      }
      let query = db
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
      if (limit) {
        query = query.limit(10)
      }
      query = query.orderBy('messages', 'desc')
      const rows = await query.execute()
      const normalized = rows.map((row) => {
        return {
          ...row,
          tokens: Number(row.tokens),
          messages: Number(row.messages),
        }
      })
      return ok(normalized)
    },
  }),
})
