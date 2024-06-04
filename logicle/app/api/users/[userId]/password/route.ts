import { hashPassword } from '@/lib/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { getUserById } from '@/models/user'
import { db } from 'db/database'
import { requireAdmin } from '@/app/api/utils/auth'

export const PUT = requireAdmin(async (req: Request, route: { params: { userId: string } }) => {
  const { newPassword } = (await req.json()) as {
    newPassword: string
  }

  const user = await getUserById(route.params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity('No such user')
  }

  await db
    .updateTable('User')
    .set({ password: await hashPassword(newPassword) })
    .where('id', '=', route.params.userId)
    .execute()
  return ApiResponses.json(user)
})
