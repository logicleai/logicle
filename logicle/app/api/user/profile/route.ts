import { deleteUserImage, getUserById, getUserWorkspaces, updateUser } from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateableUserSelfDTO, UserProfileDto, roleDto } from '@/types/user'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'
import Assistants from '@/models/assistant'
import { WorkspaceRole } from '@/types/workspace'
import { Updateable } from 'kysely'
import * as schema from '@/db/schema'
import { createImageFromDataUriIfNotNull } from '@/models/images'

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
  const sanitizedUser = sanitize<UpdateableUserSelfDTO>(await req.json(), UpdateableUserSelfDTOKeys)

  // extract the image field, we will handle it separately, and discard unwanted fields
  let createdImage = await createImageFromDataUriIfNotNull(sanitizedUser.image)
  const dbUser = {
    ...sanitizedUser,
    image: undefined,
    imageId: createdImage?.id ?? null,
  } as Updateable<schema.User>

  // delete the old image
  await deleteUserImage(session.user.id)
  await updateUser(session.user.id, dbUser)
  return ApiResponses.success()
})
