import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
export const dynamic = 'force-dynamic'

function formatDate(d) {
  let month = '' + (d.getMonth() + 1)
  let day = '' + d.getDate()
  const year = d.getFullYear()

  if (month.length < 2) month = '0' + month
  if (day.length < 2) day = '0' + day

  return [year, month, day].join('-') + ' 00:00:00'
}

export const GET = requireAdmin(async () => {
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
  return ApiResponses.json(result)
})
