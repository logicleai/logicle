import { deleteUserById, getUserById, updateUser } from '@/models/user'
import { isCurrentUser, requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { SelectableUserDTO, UpdateableUserDTO, mapRole, roleDto } from '@/types/user'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import * as schema from '@/db/schema'
import { Updateable } from 'kysely'
import { splitDataUri } from '@/lib/uris'
import { nanoid } from 'nanoid'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

export const DELETE = requireAdmin(async (req: Request, route: { params: { userId: string } }) => {
  if (await isCurrentUser(route.params.userId)) {
    return ApiResponses.forbiddenAction('You cannot delete your own account')
  }

  try {
    await deleteUserById(route.params.userId)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
    ) {
      return ApiResponses.foreignKey('User has some activitity which is not deletable')
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})

export const GET = requireAdmin(async (req: Request, route: { params: { userId: string } }) => {
  const user = await getUserById(route.params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity(`There is no user with id ${route.params.userId}`)
  }
  const roleName = roleDto(user.roleId)
  if (!roleName) {
    return ApiResponses.internalServerError('Invalid user role')
  }
  const userDTO: SelectableUserDTO = {
    ...user,
    role: roleName,
  }
  return ApiResponses.json(userDTO)
})

const UpdateableUserDTOKeys: KeysEnum<UpdateableUserDTO> = {
  name: true,
  email: true,
  image: true,
  password: true,
  role: true,
}

export const PATCH = requireAdmin(async (req: Request, route: { params: { userId: string } }) => {
  const user = sanitize<UpdateableUserDTO>(await req.json(), UpdateableUserDTOKeys)
  const oldUser = await getUserById(route.params.userId)
  if ((await isCurrentUser(route.params.userId)) && user.role) {
    return ApiResponses.forbiddenAction("Can't update self role")
  }
  const roleId = mapRole(user.role)
  if (!roleId && user.role) {
    return ApiResponses.internalServerError('Invalid user role')
  }
  const image = user.image

  // extract the image field, we will handle it separately, and update the user table
  const dbUser = {
    ...user,
    image: undefined,
    role: undefined,
    imageId: null,
  } as Updateable<schema.User>

  // if there is an image, create an entry in image table for it
  if (image) {
    const { data, mimeType } = splitDataUri(user.image)
    const id = nanoid()
    await db
      .insertInto('Image')
      .values({
        id,
        data,
        mimeType,
      })
      .execute()
    dbUser.imageId = id
  }

  // delete the old image
  const oldImageId = oldUser?.imageId
  if (oldImageId) {
    await db.deleteFrom('Image').where('Image.id', '=', oldImageId).execute()
  }

  updateUser(route.params.userId, dbUser)
  return ApiResponses.success()
})
