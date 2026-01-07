import { db } from '@/db/database'
import { noBody, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { PUT } = route({
  PUT: operation({
    name: 'Update user preferences',
    authentication: 'user',
    requestBodySchema: dto.userPreferencesSchema.partial(),
    responses: [responseSpec(204)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      await db
        .updateTable('User')
        .set('preferences', JSON.stringify(requestBody))
        .where('User.id', '=', session.userId)
        .execute()
      return noBody()
    },
  }),
})
