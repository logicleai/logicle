import { z } from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

export const apiKeySchema = z.object({
  id: z.string(),
  key: z.string(),
  userId: z.string(),
  description: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  expiresAt: iso8601UtcDateTimeSchema.nullable(),
  enabled: z.number(),
  provisioned: z.boolean(),
}).meta({ id: 'ApiKey' })

export const insertableApiKeySchema = apiKeySchema.omit({
  key: true,
  id: true,
  provisioned: true,
  createdAt: true,
  enabled: true,
}).meta({ id: 'InsertableApiKey' })

export const insertableUserApiKeySchema = insertableApiKeySchema.omit({
  userId: true,
}).meta({ id: 'InsertableUserApiKey' })

export type ApiKey = z.infer<typeof apiKeySchema>
export type InsertableApiKey = z.infer<typeof insertableApiKeySchema>
export type InsertableUserApiKey = z.infer<typeof insertableUserApiKeySchema>
