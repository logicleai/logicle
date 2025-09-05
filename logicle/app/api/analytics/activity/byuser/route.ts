import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { NextRequest } from 'next/server'
import { nanoid } from 'nanoid'

export const dynamic = 'force-dynamic'

function formatDate(d) {
  let month = `${d.getMonth() + 1}`
  let day = `${d.getDate()}`
  const year = d.getFullYear()

  if (month.length < 2) month = `0${month}`
  if (day.length < 2) day = `0${day}`

  return `${[year, month, day].join('-')} 00:00:00`
}

export const GET = requireAdmin(async (req: NextRequest) => {
  const limit = req.nextUrl.searchParams.get('limit')
  const dateStart = new Date()
  dateStart.setMonth(dateStart.getMonth() - 1)
  let query = db
    .selectFrom('MessageAudit')
    .leftJoin('User', (join) => join.onRef('MessageAudit.userId', '=', 'User.id'))
    .select('userId')
    .select('User.name')
    .select((eb) => eb.fn.sum('tokens').as('tokens'))
    .select((eb) => eb.fn.countAll().as('messages'))
    .groupBy(['userId', 'User.name'])
    .where((eb) => eb('MessageAudit.sentAt', '>=', formatDate(dateStart)))
    .where((eb) => eb('MessageAudit.type', '=', 'user'))
  if (limit) {
    query = query.limit(10)
  }
  query = query.orderBy('messages', 'desc')
  return ApiResponses.json(await query.execute())
})
