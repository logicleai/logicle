import {
  deleteUserImage,
  getUserById,
  getUserWorkspaceMemberships,
  updateUser,
} from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'
import Assistants from '@/models/assistant'
import { WorkspaceRole } from '@/types/workspace'
import { Updateable } from 'kysely'
import * as schema from '@/db/schema'
import { createImageFromDataUriIfNotNull } from '@/models/images'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const user = await getUserById(session.user.id)
  if (!user) {
    return ApiResponses.noSuchEntity('Unknown session user')
  }
  const roleName = dto.roleDto(user.roleId)
  if (!roleName) {
    return ApiResponses.internalServerError('Invalid user role')
  }
  const enabledWorkspaces = await getUserWorkspaceMemberships(session.user.id)
  const pinnedAssistants = await Assistants.withUserData({
    userId: session.user.id,
    workspaceIds: enabledWorkspaces.map((w) => w.id),
    pinned: true,
  })

  const userDTO: dto.UserProfile = {
    ...user,
    role: roleName,
    image: user.imageId ? `/api/images/${user.imageId}` : null,
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

const UpdateableUserSelfKeys: KeysEnum<dto.UpdateableUserSelf> = {
  name: true,
  email: true,
  image: true,
  password: true,
}

export const PATCH = requireSession(async (session, req) => {
  const sanitizedUser = sanitize<dto.UpdateableUserSelf>(await req.json(), UpdateableUserSelfKeys)

  // extract the image field, we will handle it separately, and discard unwanted fields
  const createdImage = await createImageFromDataUriIfNotNull(sanitizedUser.image)
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
