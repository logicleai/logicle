import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
export const dynamic = 'force-dynamic'

export const GET = requireSession(async () => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  const endOfMonth = new Date(startOfMonth)
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)
  const result = await db
    .selectFrom('MessageAudit')
    .select((eb) => eb.fn.count('userId').distinct().as('users'))
    .select((eb) => eb.fn.count('messageId').distinct().as('messages'))
    .select((eb) => eb.fn.count('conversationId').distinct().as('conversations'))
    .executeTakeFirstOrThrow()
  return ApiResponses.json(result)
})
