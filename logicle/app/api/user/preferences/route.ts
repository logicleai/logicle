import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { PUT } = route({
  PUT: operation({
    name: 'Update user preferences',
    authentication: 'user',
    requestBodySchema: dto.userPreferencesSchema.partial(),
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      await db
        .updateTable('User')
        .set('preferences', JSON.stringify(requestBody))
        .where('User.id', '=', session.userId)
        .execute()
      return ApiResponses.success()
    },
  }),
})
