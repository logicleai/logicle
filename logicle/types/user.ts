import { Sharing } from './dto/sharing'
import { WorkspaceRole } from './workspace'
import * as schema from '@/db/schema'

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

export type SelectableUserDTO = Omit<schema.User, 'roleId' | 'imageId'> & {
  role: UserRoleName
  image: string | null
}
export type InsertableUserDTO = Omit<SelectableUserDTO, 'createdAt' | 'updatedAt'>
export type UpdateableUserDTO = Omit<InsertableUserDTO, 'id'>
export type UpdateableUserSelfDTO = Omit<UpdateableUserDTO, 'role'>

export interface UserAssistant {
  id: string
  name: string
  description: string
  iconUri?: string | null
  pinned: boolean
  lastUsed: string | null
  owner: string
  sharing: Sharing[]
}

export type UserProfileDto = SelectableUserDTO & {
  workspaces: {
    id: string
    name: string
    role: WorkspaceRole
  }[]
  pinnedAssistants: UserAssistant[]
}
