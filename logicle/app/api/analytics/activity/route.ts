import { db } from '@/db/database'
import { error, errorSpec, ok, operation, responseSpec, route } from '@/lib/routes'
import { getAnalyticsRange, formatDateTime, parseUserIdsParam } from '@/app/api/analytics/utils'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'Get activity summary',
    description: 'Fetch activity summary for a given period.',
    authentication: 'admin',
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
    implementation: async (req: Request) => {
      const range = getAnalyticsRange(req)
      if (!range) {
        return error(400, 'Invalid analytics range')
      }
      const url = new URL(req.url)
      const workspaceId = url.searchParams.get('workspaceId')
      const userIds = parseUserIdsParam(url.searchParams.get('userIds'))

      let query = db
        .selectFrom('MessageAudit')
        .select((eb) => eb.fn.count('userId').distinct().as('users'))
        .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
        .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
        .where((eb) => eb('MessageAudit.sentAt', '>=', formatDateTime(range.start)))
        .where((eb) => eb('MessageAudit.sentAt', '<', formatDateTime(range.end)))
        .where((eb) => eb('MessageAudit.type', '=', 'user'))

      if (workspaceId) {
        query = query.where('MessageAudit.userId', 'in', (eb) =>
          eb.selectFrom('WorkspaceMember').select('userId').where('workspaceId', '=', workspaceId)
        )
      }

      if (userIds.length > 0) {
        query = query.where('MessageAudit.userId', 'in', userIds)
      }

      const resultRaw = await query.executeTakeFirstOrThrow()
      const result = {
        users: Number(resultRaw.users),
        messages: Number(resultRaw.messages),
        conversations: Number(resultRaw.conversations),
      }
      return ok(result)
    },
  }),
})
