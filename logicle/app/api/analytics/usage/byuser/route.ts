import Assistants from '@/models/assistant'
import { requireAdmin, requireSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { Session } from 'next-auth'
import { db } from '@/db/database'
import { string } from 'zod'

export const dynamic = 'force-dynamic'

function formatDate(d) {
  var month = '' + (d.getMonth() + 1),
    day = '' + d.getDate(),
    year = d.getFullYear()

  if (month.length < 2) month = '0' + month
  if (day.length < 2) day = '0' + day

  return [year, month, day].join('-')
}
export const GET = requireSession(async (session: Session, req: Request) => {
  var startOfMonth = new Date()
  startOfMonth.setDate(1)
  var endOfMonth = new Date(startOfMonth)
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)
  const result = await db
    .selectFrom('MessageAudit')
    .leftJoin('User', (join) => join.onRef('MessageAudit.userId', '=', 'User.id'))
    .select('userId')
    .select('User.name')
    .select((eb) => eb.fn.sum('tokens').as('tokens'))
    .groupBy(['userId', 'User.name'])
    .limit(10)
    .orderBy('tokens', 'desc')
    .execute()
  return ApiResponses.json(result)
})
