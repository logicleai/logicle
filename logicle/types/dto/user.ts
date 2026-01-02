import { WorkspaceRole } from '../workspace'
import * as schema from '@/db/schema'
import { z } from 'zod'

export type UserRole = schema.UserRole

export const insertableUserSchema = z.object({
  ssoUser: z.boolean(),
  email: z.string().email(),
  name: z.string(),
  password: z.string().nullable(),
  role: z.nativeEnum(schema.UserRole),
  preferences: z.string(),
  image: z.string().nullable(),
  properties: z.record(z.string()),
})

export const updateableUserSchema = insertableUserSchema.partial()
export const updateableUserSelfSchema = updateableUserSchema.omit({
  role: true,
  password: true,
  ssoUser: true,
})

export type User = Omit<schema.User, 'imageId' | 'ssoUser'> & {
  image: string | null
  ssoUser: boolean
  properties: Record<string, string>
}

export type InsertableUser = Omit<
  User,
  'id' | 'createdAt' | 'updatedAt' | 'provisioned' | 'tokenVersion'
> & {}

export type UpdateableUser = z.infer<typeof updateableUserSchema>
export type UpdateableUserSelf = z.infer<typeof updateableUserSelfSchema>

export interface WorkspaceMembership {
  id: string
  name: string
  role: WorkspaceRole
}
