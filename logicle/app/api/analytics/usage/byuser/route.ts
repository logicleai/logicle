import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { Session } from 'next-auth'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session: Session, req: Request) => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  const endOfMonth = new Date(startOfMonth)
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
