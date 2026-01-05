import { hashPassword } from '@/lib/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { getUserById } from '@/models/user'
import { db } from 'db/database'
import { requireAdmin } from '@/app/api/utils/auth'
import { adminChangePasswordRequestSchema } from '@/types/dto'

export const PUT = requireAdmin(async (req: Request, params: { userId: string }) => {
  const result = adminChangePasswordRequestSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const { newPassword } = result.data

  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity('No such user')
  }
  if (user.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned user")
  }
  await db
    .updateTable('User')
    .set({ password: await hashPassword(newPassword) })
    .where('id', '=', params.userId)
    .execute()
  return ApiResponses.json(user)
})

export const DELETE = requireAdmin(async (_req: Request, params: { userId: string }) => {
  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity('No such user')
  }
  if (user.provisioned) {
    return ApiResponses.forbiddenAction("Can't modify a provisioned user")
  }
  await db.updateTable('User').set({ password: null }).where('id', '=', params.userId).execute()
  return ApiResponses.json(user)
})
