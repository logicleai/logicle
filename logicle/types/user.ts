import { Selectable } from 'kysely'
import { User } from './dto'
import { UserAssistant } from './chat'

export enum UserRoleId {
  USER = 1,
  ADMIN = 2,
}
export enum UserRoleName {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export const userRoles = [
  {
    id: UserRoleId.USER,
    name: UserRoleName.USER,
  },
  {
    id: UserRoleId.ADMIN,
    name: UserRoleName.ADMIN,
  },
]

export function mapRole(role: string) {
  switch (role) {
    case UserRoleName.USER:
      return UserRoleId.USER
    case UserRoleName.ADMIN:
      return UserRoleId.ADMIN
    default:
      return undefined
  }
}

export function roleDto(role: UserRoleId) {
  switch (role) {
    case UserRoleId.USER:
      return UserRoleName.USER
    case UserRoleId.ADMIN:
      return UserRoleName.ADMIN
    default:
      return undefined
  }
}

export type UserDTOBase = Omit<User, 'roleId'> & { role: UserRoleName }
export type SelectableUserDTO = Selectable<UserDTOBase>
export type InsertableUserDTO = Omit<UserDTOBase, 'createdAt' | 'updatedAt'>
export type UpdateableUserDTO = Omit<InsertableUserDTO, 'id'>
export type UpdateableUserSelfDTO = Omit<UpdateableUserDTO, 'role'>
export type UserProfileDto = SelectableUserDTO & {
  workspaces: {
    id: string
    name: string
    role: string
  }[]
  pinnedAssistants: UserAssistant[]
}
