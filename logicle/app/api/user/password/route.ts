import { hashPassword, verifyPassword } from '@/lib/auth'
import { NextRequest } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { getUserById } from '@/models/user'
import { db } from 'db/database'
import { requireSession } from '../../utils/auth'

export const PUT = requireSession(async (session, req: NextRequest) => {
  if (!session) {
    return ApiResponses.notAuthorized('Missing session')
  }
  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword: string
    newPassword: string
  }

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
  return ApiResponses.json(user)
})
