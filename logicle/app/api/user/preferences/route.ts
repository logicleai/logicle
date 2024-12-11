import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '../../utils/auth'
import * as dto from '@/types/dto'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

export const PUT = requireSession(async (session, req) => {
  const preferences = (await req.json()) as dto.UserPreferences
  await db.updateTable('User').set('preferences', JSON.stringify(preferences)).execute()
  return ApiResponses.success()
})
