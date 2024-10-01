import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { sql } from 'kysely'

export const dynamic = 'force-dynamic'

function formatDate(d) {
  let month = '' + (d.getMonth() + 1)
  let day = '' + d.getDate()
  const year = d.getFullYear()

  if (month.length < 2) month = '0' + month
  if (day.length < 2) day = '0' + day

  return [year, month, day].join('-') + ' 00:00:00'
}
export const GET = requireSession(async () => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  const endOfMonth = new Date(startOfMonth)
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)

  const makeRangeQuery = (from: string, to: string) => {
    return db
      .selectFrom('MessageAudit')
      .select(sql.lit(from).as('date'))
      .select((eb) => eb.fn.sum('tokens').as('tokens'))
      .select((eb) => eb.fn.countAll().as('messages'))
      .where((eb) =>
        eb.and([eb('MessageAudit.sentAt', '>=', from), eb('MessageAudit.sentAt', '<', to)])
      )
  }

  let query = makeRangeQuery(formatDate(startOfMonth), formatDate(endOfMonth))
  for (let i = 1; i < 12; i++) {
    endOfMonth.setTime(startOfMonth.getTime())
    startOfMonth.setMonth(startOfMonth.getMonth() - 1)
    query = query.union(makeRangeQuery(formatDate(startOfMonth), formatDate(endOfMonth)))
  }

  const result = await query.execute()
  return ApiResponses.json(result)
})
