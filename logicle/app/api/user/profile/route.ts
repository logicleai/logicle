import { getUserById, getUserWorkspaces, updateUser } from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateableUserSelfDTO, UserProfileDto, roleDto } from '@/types/user'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'
import Assistants from '@/models/assistant'
import { WorkspaceRole } from '@/types/workspace'
import { db } from '@/db/database'
import { nanoid } from 'nanoid'
import { Updateable } from 'kysely'
import { splitDataUri } from '@/lib/uris'
import * as schema from '@/db/schema'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const user = await getUserById(session.user.id)
  if (!user) {
    return ApiResponses.noSuchEntity('Unknown session user')
  }
  const roleName = roleDto(user.roleId)
  if (!roleName) {
    return ApiResponses.internalServerError('Invalid user role')
  }
  const enabledWorkspaces = await getUserWorkspaces(session.user.id)
  const pinnedAssistants = await Assistants.withUserData({
    userId: session.user.id,
    workspaceIds: enabledWorkspaces.map((w) => w.id),
    pinned: true,
  })

  const userDTO: UserProfileDto = {
    ...user,
    role: roleName,
    workspaces: enabledWorkspaces.map((w) => {
      return {
        id: w.id,
        name: w.name,
        role: w.role as WorkspaceRole,
      }
    }),
    pinnedAssistants,
  }
  return ApiResponses.json(userDTO)
})

const UpdateableUserSelfDTOKeys: KeysEnum<UpdateableUserSelfDTO> = {
  name: true,
  email: true,
  image: true,
  password: true,
}

export const PATCH = requireSession(async (session, req) => {
  const oldUser = await getUserById(session.user.id)

  const update = sanitize<UpdateableUserSelfDTO>(await req.json(), UpdateableUserSelfDTOKeys)

  // extract the image field, we will handle it separately, and update the user table
  const image = update.image
  const dbUser = {
    ...update,
    image: undefined,
    imageId: null,
  } as Updateable<schema.User>

  // if there is an image, create an entry in image table for it
  if (image) {
    const { data, mimeType } = splitDataUri(image)
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

  updateUser(session.user.id, dbUser)
  return ApiResponses.success()
})
