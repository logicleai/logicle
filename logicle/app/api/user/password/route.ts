import { db } from '@/db/database'
import { forbidden, noBody, notFound, operation, responseSpec, route } from '@/lib/routes'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { changePasswordRequestSchema } from '@/types/dto/auth'

export const { PUT } = route({
  PUT: operation({
    name: 'Change own password',
    description: 'Change the authenticated user password.',
    authentication: 'user',
    requestBodySchema: changePasswordRequestSchema,
    responses: [responseSpec(204), responseSpec(400), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const { currentPassword, newPassword } = requestBody
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
  }),
})
