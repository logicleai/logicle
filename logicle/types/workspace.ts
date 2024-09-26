import * as schema from '@/db/schema'

export enum WorkspaceRole {
  ADMIN = 'ADMIN',
  OWNER = 'OWNER',
  MEMBER = 'MEMBER',
  EDITOR = 'EDITOR',
}

export const workspaceRoles: WorkspaceRole[] = [
  WorkspaceRole.MEMBER,
  WorkspaceRole.ADMIN,
  WorkspaceRole.OWNER,
  WorkspaceRole.EDITOR,
]
