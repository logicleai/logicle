import { Workspace, WorkspaceMember, User } from '@/types/db'

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
}

export type WorkspaceMemberDTO = Omit<WorkspaceMember, 'role'> & {
  role: WorkspaceRole
  name: string
  email: string
}

export const workspaceRoles: WorkspaceRole[] = [
  WorkspaceRole.MEMBER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.OWNER,
]

export type WorkspaceWithMemberCount = Workspace & { memberCount: number }
export type WorkspaceMemberWithUser = WorkspaceMemberDTO & { user: User }
