import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '../../utils/auth'
import * as dto from '@/types/dto'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

export const PUT = requireSession(async (session, req) => {
  const result = dto.userPreferencesSchema.partial().safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  await db
    .updateTable('User')
    .set('preferences', JSON.stringify(result.data))
    .where('User.id', '=', session.userId)
    .execute()
  return ApiResponses.success()
})
