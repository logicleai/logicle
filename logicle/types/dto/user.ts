import { WorkspaceRole } from '../workspace'
import * as schema from '@/db/schema'

export type User = Omit<schema.User, 'imageId' | 'ssoUser'> & {
  image: string | null
  ssoUser: boolean
}
export type InsertableUser = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'provisioned'> & {
  properties: Record<string, string>
}
export type UpdateableUser = InsertableUser
export type UpdateableUserSelf = Omit<UpdateableUser, 'role' | 'password' | 'ssoUser'>

export interface WorkspaceMembership {
  id: string
  name: string
  role: WorkspaceRole
}
