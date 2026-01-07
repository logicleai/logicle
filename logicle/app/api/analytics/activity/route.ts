import { db } from '@/db/database'
import { ok, operation, responseSpec, route } from '@/lib/routes'
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
    responses: [responseSpec(200)] as const,
    implementation: async () => {
      const dateStart = new Date()
      dateStart.setMonth(dateStart.getMonth() - 1)
      const result = await db
        .selectFrom('MessageAudit')
        .select((eb) => eb.fn.count('userId').distinct().as('users'))
        .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
        .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
        .where((eb) => eb('MessageAudit.sentAt', '>=', formatDate(dateStart)))
        .where((eb) => eb('MessageAudit.type', '=', 'user'))
        .executeTakeFirstOrThrow()
      return ok(result)
    },
  }),
})
