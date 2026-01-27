import { db } from '@/db/database'
import { error, ok, operation, responseSpec, route } from '@/lib/routes'
import { getAnalyticsRange, formatDateTime } from '@/app/api/analytics/utils'
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
    ] as const,
    implementation: async (req: Request) => {
      const range = getAnalyticsRange(req)
      if (!range) {
        return error(400, 'Invalid analytics range')
      }
      const resultRaw = await db
        .selectFrom('MessageAudit')
        .select((eb) => eb.fn.count('userId').distinct().as('users'))
        .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
        .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
        .where((eb) => eb('MessageAudit.sentAt', '>=', formatDateTime(range.start)))
        .where((eb) => eb('MessageAudit.sentAt', '<', formatDateTime(range.end)))
        .where((eb) => eb('MessageAudit.type', '=', 'user'))
        .executeTakeFirstOrThrow()
      const result = {
        users: Number(resultRaw.users),
        messages: Number(resultRaw.messages),
        conversations: Number(resultRaw.conversations),
      }
      return ok(result)
    },
  }),
})
