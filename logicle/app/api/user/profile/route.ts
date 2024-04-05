import { getUserById, getUserWorkspaces, updateUser } from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { UpdateableUserSelfDTO, UserProfileDto, roleDto } from '@/types/user'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'
import Assistants from '@/models/assistant'
import { UserAssistant } from '@/types/chat'

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
  const assistants = await Assistants.withUserData(session!.user.id)
  const userAssistants = assistants.map((assistant) => {
    const model: UserAssistant = {
      id: assistant.id,
      name: assistant.name,
      description: assistant.description,
      icon: assistant.icon,
      pinned: assistant.pinned == 1,
      lastUsed: assistant.lastUsed,
    }
    return model
  })

  const userDTO: UserProfileDto = {
    ...user,
    role: roleName,
    workspaces: (await getUserWorkspaces(session.user.id)).map((w) => {
      return {
        id: w.id,
        name: w.name,
      }
    }),
    assistants: userAssistants,
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
  const update = sanitize<UpdateableUserSelfDTO>(await req.json(), UpdateableUserSelfDTOKeys)
  updateUser(session.user.id, update)
  return ApiResponses.success()
})
