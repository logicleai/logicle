import { db } from '@/db/database'
import { forbidden, noBody, notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { changePasswordRequestSchema } from '@/types/dto/auth'

export const PUT = operation({
  name: 'Change own password',
  description: 'Change the authenticated user password.',
  authentication: 'user',
  requestBodySchema: changePasswordRequestSchema,
  responses: [responseSpec(204), errorSpec(400), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ session, body }) => {
    const { currentPassword, newPassword } = body
    const user = await getUserById(session.userId)
    if (!user) {
      return notFound('No such user')
    }

    if (user.ssoUser) {
      return forbidden("Can't change password of an SSO user")
    }

    if (!(await verifyPassword(currentPassword, user.password as string))) {
      return forbidden('Your current password is incorrect')
    }

    await db
      .updateTable('User')
      .set({ password: await hashPassword(newPassword) })
      .where('id', '=', session.userId)
      .execute()
    return noBody()
  },
})
