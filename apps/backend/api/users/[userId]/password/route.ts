import { hashPassword } from '@/lib/auth/password'
import { db } from '@/db/database'
import { forbidden, noBody, notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getUserById } from '@/models/user'
import { adminChangePasswordRequestSchema } from '@/types/dto'

export const PUT = operation({
  name: 'Set user password',
  description: 'Set or reset a user password.',
  authentication: 'admin',
  requestBodySchema: adminChangePasswordRequestSchema,
  responses: [responseSpec(204), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, body }) => {
    const { newPassword } = body

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
})

export const DELETE = operation({
  name: 'Delete user password',
  description: 'Remove a user password.',
  authentication: 'admin',
  responses: [responseSpec(204), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params }) => {
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
})
