import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { changePasswordRequestSchema } from '@/types/dto/auth'

export const { PUT } = route({
  PUT: operation({
    name: 'Change own password',
    description: 'Change the authenticated user password.',
    authentication: 'user',
    requestBodySchema: changePasswordRequestSchema,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const { currentPassword, newPassword } = requestBody
      const user = await getUserById(session.userId)
      if (!user) {
        return ApiResponses.noSuchEntity('No such user')
      }

      if (user.ssoUser) {
        return ApiResponses.forbiddenAction("Can't change password of an SSO user")
      }

      if (!(await verifyPassword(currentPassword, user.password as string))) {
        return ApiResponses.invalidParameter('Your current password is incorrect')
      }

      await db
        .updateTable('User')
        .set({ password: await hashPassword(newPassword) })
        .where('id', '=', session.userId)
        .execute()
      return user
    },
  }),
})
