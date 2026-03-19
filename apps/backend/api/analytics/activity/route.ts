import { db } from '@/db/database'
import { error, errorSpec, ok, operation, responseSpec } from '@/lib/routes'
import {
  formatDateTime,
  getAnalyticsRangeFromQuery,
  parseUserIdsParam,
} from '@/app/api/analytics/utils'
import { z } from 'zod'

const activityQuerySchema = z.object({
  period: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  workspaceId: z.string().optional(),
  userIds: z.string().optional(),
})

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get activity summary',
  description: 'Fetch activity summary for a given period.',
  authentication: 'admin',
  querySchema: activityQuerySchema,
  responses: [
    responseSpec(
      200,
      z.object({
        users: z.number(),
        messages: z.number(),
        conversations: z.number(),
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

    let activityQuery = db
      .selectFrom('MessageAudit')
      .select((eb) => eb.fn.count('userId').distinct().as('users'))
      .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
      .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
      .where((eb) => eb('MessageAudit.sentAt', '>=', formatDateTime(range.start)))
      .where((eb) => eb('MessageAudit.sentAt', '<', formatDateTime(range.end)))
      .where((eb) => eb('MessageAudit.type', '=', 'user'))

    if (workspaceId) {
      activityQuery = activityQuery.where('MessageAudit.userId', 'in', (eb) =>
        eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
      )
    }

    if (userIds.length > 0) {
      activityQuery = activityQuery.where('MessageAudit.userId', 'in', userIds)
    }

    const resultRaw = await activityQuery.executeTakeFirstOrThrow()
    const result = {
      users: Number(resultRaw.users),
      messages: Number(resultRaw.messages),
      conversations: Number(resultRaw.conversations),
    }
    return ok(result)
  },
})
