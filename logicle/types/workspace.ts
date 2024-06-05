import * as dto from '@/types/dto'
import * as schema from '@/db/schema'

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
}

export type WorkspaceMemberDTO = Omit<dto.WorkspaceMember, 'role'> & {
  role: WorkspaceRole
  name: string
  email: string
}

export const workspaceRoles: WorkspaceRole[] = [
  WorkspaceRole.MEMBER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.OWNER,
]

export type WorkspaceWithMemberCount = dto.Workspace & { memberCount: number }

export type WorkspaceMemberWithUser = WorkspaceMemberDTO & { user: schema.User }
