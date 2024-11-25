import { WorkspaceRole } from '../workspace'
import * as schema from '@/db/schema'

export type User = Omit<schema.User, 'imageId'> & {
  image: string | null
}
export type InsertableUser = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'provisioned'>
export type UpdateableUser = InsertableUser
export type UpdateableUserSelf = Omit<UpdateableUser, 'role'>

export interface WorkspaceMembership {
  id: string
  name: string
  role: WorkspaceRole
}
