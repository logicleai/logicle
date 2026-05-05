import { z } from 'zod'

export const joinRequestSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
}).meta({ id: 'JoinRequest' })

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
}).meta({ id: 'LoginRequest' })

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
}).meta({ id: 'ChangePasswordRequest' })

export const adminChangePasswordRequestSchema = z.object({
  newPassword: z.string(),
}).meta({ id: 'AdminChangePasswordRequest' })

export const insertableOidcConnectionSchema = z.object({
  name: z.string(),
  description: z.string(),
  discoveryUrl: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string(),
}).meta({ id: 'InsertableOidcConnection' })

export const insertableSamlConnectionSchema = z.object({
  name: z.string(),
  description: z.string(),
  rawMetadata: z.string(),
}).meta({ id: 'InsertableSamlConnection' })

export const updateableSsoConnectionSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
}).meta({ id: 'UpdateableSsoConnection' })

export type JoinRequest = z.infer<typeof joinRequestSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>
export type AdminChangePasswordRequest = z.infer<typeof adminChangePasswordRequestSchema>
export type UpdateableSsoConnection = z.infer<typeof updateableSsoConnectionSchema>
export type InsertableSamlConnection = z.infer<typeof insertableSamlConnectionSchema>
export type InsertableOidcConnection = z.infer<typeof insertableOidcConnectionSchema>
