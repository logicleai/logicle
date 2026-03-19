import { db } from '@/db/database'
import { noBody, operation, responseSpec } from '@/lib/routes'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const PUT = operation({
  name: 'Update user preferences',
  authentication: 'user',
  requestBodySchema: dto.userPreferencesSchema.partial(),
  responses: [responseSpec(204)] as const,
  implementation: async ({ session, body }) => {
    await db
      .updateTable('User')
      .set('preferences', JSON.stringify(body))
      .where('User.id', '=', session.userId)
      .execute()
    return noBody()
  },
})
