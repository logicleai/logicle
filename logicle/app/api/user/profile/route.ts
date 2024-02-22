import { getUserById, updateUser } from 'models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { SelectableUserDTO, UpdateableUserSelfDTO, roleDto } from '@/types/user'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'

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
  const userDTO: SelectableUserDTO = {
    ...user,
    role: roleName,
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
