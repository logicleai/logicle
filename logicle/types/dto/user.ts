import { WorkspaceRole } from '../workspace'
import * as schema from '@/db/schema'
import { z } from 'zod'
import { userAssistantSchema } from './assistant'
import { userPreferencesSchema } from './userpreferences'

export type UserRole = schema.UserRole

export const userSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  email: z.string().email(),
  name: z.string(),
  password: z.string().nullable(),
  role: z.nativeEnum(schema.UserRole),
  provisioned: z.number().int(),
  updatedAt: z.string().datetime(),
  preferences: z.string(),
  tokenVersion: z.number().int(),
  image: z.string().nullable(),
  ssoUser: z.boolean(),
  properties: z.record(z.string(), z.string()),
})

export const insertableUserSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  ssoUser: z.boolean(),
  password: z.string().nullable(),
  role: z.nativeEnum(schema.UserRole),
  preferences: z.string(),
  image: z.string().nullable(),
  properties: z.record(z.string(), z.string()),
})

export const updateableUserSchema = insertableUserSchema.partial()

export const updateableUserSelfSchema = updateableUserSchema.omit({
  role: true,
  password: true,
  ssoUser: true,
})

export type User = z.infer<typeof userSchema>
export type InsertableUser = z.infer<typeof insertableUserSchema>
export type UpdateableUser = z.infer<typeof updateableUserSchema>
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
})

export const userProfileSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  email: z.string().email(),
  name: z.string(),
  role: z.nativeEnum(schema.UserRole),
  provisioned: z.number().int(),
  updatedAt: z.string().datetime(),
  tokenVersion: z.number().int(),
  image: z.string().nullable(),
  ssoUser: z.boolean(),
  properties: z.record(z.string(), z.string()),
  workspaces: workspaceMembershipSchema.array(),
  lastUsedAssistant: userAssistantSchema.nullable(),
  pinnedAssistants: userAssistantSchema.array(),
  preferences: userPreferencesSchema.partial(),
})

export type UserProfile = z.infer<typeof userProfileSchema>
