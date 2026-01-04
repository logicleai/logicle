import {
  deleteUserById,
  getUserById,
  getUserParameterValuesAsRecord,
  setUserParameterValues,
  updateUser,
} from '@/models/user'
import { requireAdmin, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as schema from '@/db/schema'
import { Updateable } from 'kysely'
import { getOrCreateImageFromNullableDataUri } from '@/models/images'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const DELETE = requireAdmin(
  async (_req: Request, params: { userId: string }, session: SimpleSession) => {
    if (session.userId === params.userId) {
      return ApiResponses.forbiddenAction('You cannot delete your own account')
    }
    const currentUser = await getUserById(params.userId)
    if (!currentUser) {
      return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
    }
    if (currentUser.provisioned) {
      return ApiResponses.forbiddenAction("Can't modify a provisioned user")
    }

    try {
      await deleteUserById(params.userId)
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
      ) {
        return ApiResponses.foreignKey('User has some activitity which is not deletable')
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)

export const GET = requireAdmin(async (_req: Request, params: { userId: string }) => {
  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
  }
  const userDTO: dto.User = {
    ...user,
    ssoUser: !!user.ssoUser,
    image: user.imageId ? `/api/images/${user.imageId}` : null,
    properties: await getUserParameterValuesAsRecord(params.userId),
  }
  return ApiResponses.json(userDTO)
})

export const PATCH = requireAdmin(
  async (req: Request, params: { userId: string }, session: SimpleSession) => {
    const result = dto.updateableUserSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    const user: dto.UpdateableUser = result.data
    const currentUser = await getUserById(params.userId)
    if (!currentUser) {
      return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
    }
    if (currentUser.provisioned) {
      return ApiResponses.forbiddenAction("Can't modify a provisioned user")
    }
    if (session.userId === params.userId && user.role) {
      return ApiResponses.forbiddenAction("Can't update self role")
    }
    const imageId =
      user.image !== undefined ? await getOrCreateImageFromNullableDataUri(user.image) : undefined

    // extract the image field, we will handle it separately, and update the user table
    const dbUser = {
      ...user,
      ssoUser: user.ssoUser ? 1 : 0,
      image: undefined,
      imageId,
      properties: undefined,
    } as Updateable<schema.User>

    await updateUser(params.userId, dbUser)
    if (user.properties) {
      await setUserParameterValues(params.userId, user.properties)
    }
    return ApiResponses.success()
  }
)
