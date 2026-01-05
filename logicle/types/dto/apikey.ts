import { z } from 'zod'

export const apiKeySchema = z.object({
  id: z.string(),
  key: z.string(),
  userId: z.string(),
  description: z.string(),
  createdAt: z.string(), // consider .datetime() if it's ISO
  expiresAt: z.string().nullable(), // consider .datetime().nullable()
  enabled: z.number(),
  provisioned: z.number(),
})

export const insertableApiKeySchema = apiKeySchema.omit({
  key: true,
  id: true,
  provisioned: true,
  createdAt: true,
  enabled: true,
})

export const insertableUserApiKeySchema = insertableApiKeySchema.omit({
  userId: true,
})

export type ApiKey = z.infer<typeof apiKeySchema>
export type InsertableApiKey = z.infer<typeof insertableApiKeySchema>
export type InsertableUserApiKey = z.infer<typeof insertableUserApiKeySchema>
