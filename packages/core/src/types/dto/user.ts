import { WorkspaceRole } from '../workspace'
import { z } from 'zod'
import { userAssistantSchema } from './assistant'
import { userPreferencesSchema } from './userpreferences'
import { iso8601UtcDateTimeSchema } from './common'

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export const userSchema = z.object({
  id: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  email: z.string().email(),
  name: z.string(),
  password: z.string().nullable(),
  role: z.nativeEnum(UserRole),
  provisioned: z.boolean(),
  updatedAt: iso8601UtcDateTimeSchema,
  preferences: z.string(),
  image: z.string().nullable(),
  ssoUser: z.boolean(),
  properties: z.record(z.string(), z.string()),
}).meta({ id: 'User' })

export const adminUserSchema = userSchema.extend({
  enabled: z.boolean(),
}).meta({ id: 'AdminUser' })

export const insertableUserSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  ssoUser: z.boolean(),
  password: z.string().nullable(),
  role: z.nativeEnum(UserRole),
  preferences: z.string(),
  image: z.string().nullable(),
  properties: z.record(z.string(), z.string()),
}).meta({ id: 'InsertableUser' })

export const updateableUserSchema = insertableUserSchema.partial().meta({ id: 'UpdateableUser' })

export const adminUpdateableUserSchema = updateableUserSchema.extend({
  enabled: z.boolean().optional(),
}).meta({ id: 'AdminUpdateableUser' })

export const updateableUserSelfSchema = updateableUserSchema.omit({
  role: true,
  password: true,
  ssoUser: true,
}).meta({ id: 'UpdateableUserSelf' })

export type User = z.infer<typeof userSchema>
export type AdminUser = z.infer<typeof adminUserSchema>
export type InsertableUser = z.infer<typeof insertableUserSchema>
export type UpdateableUser = z.infer<typeof updateableUserSchema>
export type AdminUpdateableUser = z.infer<typeof adminUpdateableUserSchema>
export type UpdateableUserSelf = z.infer<typeof updateableUserSelfSchema>

export interface WorkspaceMembership {
  id: string
  name: string
  role: WorkspaceRole
}

export const workspaceMembershipSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.nativeEnum(WorkspaceRole),
}).meta({ id: 'WorkspaceMembership' })

export const userProfileSchema = z.object({
  id: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(UserRole),
  provisioned: z.boolean(),
  updatedAt: iso8601UtcDateTimeSchema,
  image: z.string().nullable(),
  ssoUser: z.boolean(),
  properties: z.record(z.string(), z.string()),
  workspaces: workspaceMembershipSchema.array(),
  lastUsedAssistant: userAssistantSchema.nullable(),
  pinnedAssistants: userAssistantSchema.array(),
  assistants: userAssistantSchema.array(),
  preferences: userPreferencesSchema.partial(),
}).meta({ id: 'UserProfile' })

export type UserProfile = z.infer<typeof userProfileSchema>
