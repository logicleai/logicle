import { db } from '@/db/database'
import { ok, operation, responseSpec, route } from '@/lib/routes'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

function formatDate(d) {
  let month = `${d.getMonth() + 1}`
  let day = `${d.getDate()}`
  const year = d.getFullYear()

  if (month.length < 2) month = `0${month}`
  if (day.length < 2) day = `0${day}`

  return `${[year, month, day].join('-')} 00:00:00`
}

export const { GET } = route({
  GET: operation({
    name: 'Get activity summary',
    description: 'Fetch activity summary for the last month.',
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
    implementation: async () => {
      const dateStart = new Date()
      dateStart.setMonth(dateStart.getMonth() - 1)
      const resultRaw = await db
        .selectFrom('MessageAudit')
        .select((eb) => eb.fn.count('userId').distinct().as('users'))
        .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
        .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
        .where((eb) => eb('MessageAudit.sentAt', '>=', formatDate(dateStart)))
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
