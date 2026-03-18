import { z } from 'zod'

export const userSecretTypeSchema = z.enum(['backend-credentials', 'mcp-oauth'])

export const userSecretStatusSchema = z.object({
  id: z.string(),
  context: z.string(),
  type: z.union([userSecretTypeSchema, z.string()]),
  label: z.string(),
  readable: z.boolean(),
})

export const insertableUserSecretSchema = z.object({
  context: z.string().min(1),
  type: userSecretTypeSchema,
  label: z.string().min(1),
  value: z.string().min(1),
})

export type UserSecretStatus = z.infer<typeof userSecretStatusSchema>
export type InsertableUserSecret = z.infer<typeof insertableUserSecretSchema>
