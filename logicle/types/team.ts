import { Team, TeamMember, User } from '@/types/db'

export enum TeamRoleId {
  MEMBER = 1,
  ADMIN = 2,
  OWNER = 3,
}

export enum TeamRoleName {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
}

export type TeamMemberDTO = Omit<TeamMember, 'roleId'> & {
  role: TeamRoleName
  name: string
  email: string
}

export function mapRole(role: TeamRoleName) {
  switch (role) {
    case TeamRoleName.ADMIN:
      return TeamRoleId.ADMIN
    case TeamRoleName.MEMBER:
      return TeamRoleId.MEMBER
    case TeamRoleName.OWNER:
      return TeamRoleId.OWNER
    default:
      return undefined
  }
}

export function roleDto(role: TeamRoleId) {
  switch (role) {
    case TeamRoleId.ADMIN:
      return TeamRoleName.ADMIN
    case TeamRoleId.MEMBER:
      return TeamRoleName.MEMBER
    case TeamRoleId.OWNER:
      return TeamRoleName.OWNER
    default:
      return undefined
  }
}

export type Action = 'create' | 'update' | 'read' | 'delete' | 'leave'
export type Resource = 'team' | 'team_member' | 'team_sso' | 'team_dsync'

export type Permission = {
  resource: Resource
  actions: Action[] | '*'
}

export const availableRoles = [
  {
    id: TeamRoleId.MEMBER,
    name: 'MEMBER',
  },
  {
    id: TeamRoleId.ADMIN,
    name: 'ADMIN',
  },
  {
    id: TeamRoleId.OWNER,
    name: 'OWNER',
  },
]

export type TeamWithMemberCount = Team & { memberCount: number }
export type TeamMemberWithUser = TeamMemberDTO & { user: User }
