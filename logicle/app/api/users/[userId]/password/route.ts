import { hashPassword } from '@/lib/auth'
import { db } from '@/db/database'
import { forbidden, noBody, notFound, operation, responseSpec, route } from '@/lib/routes'
import { getUserById } from '@/models/user'
import { adminChangePasswordRequestSchema } from '@/types/dto'

export const { PUT, DELETE } = route({
  PUT: operation({
    name: 'Set user password',
    description: 'Set or reset a user password.',
    authentication: 'admin',
    requestBodySchema: adminChangePasswordRequestSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }, { requestBody }) => {
      const { newPassword } = requestBody

      const user = await getUserById(params.userId)
      if (!user) {
        return notFound('No such user')
      }
      if (user.provisioned) {
        return forbidden("Can't modify a provisioned user")
      }
      await db
        .updateTable('User')
        .set({ password: await hashPassword(newPassword) })
        .where('id', '=', params.userId)
        .execute()
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete user password',
    description: 'Remove a user password.',
    authentication: 'admin',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }) => {
      const user = await getUserById(params.userId)
      if (!user) {
        return notFound('No such user')
      }
      if (user.provisioned) {
        return forbidden("Can't modify a provisioned user")
      }
      await db.updateTable('User').set({ password: null }).where('id', '=', params.userId).execute()
      return noBody()
    },
  }),
})
