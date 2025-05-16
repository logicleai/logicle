import { z } from 'zod'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { insertableBackendSchema } from '@/types/validation/backend'

export const provisionedToolSchema = z
  .object({
    capability: z.boolean().optional(),
    configuration: z.object({}),
    name: z.string(),
    description: z.string().optional(),
    tags: z.string().array().optional(),
    type: z.string(),
  })
  .strict()

export const provisionedBackendSchema = insertableBackendSchema

export const provisionedUserSchema = z
  .object({
    name: z.string(),
    email: z.string(),
    password: z.string().nullable().optional(),
    role: z.nativeEnum(dto.UserRole),
  })
  .strict()

export const provisionedApiKeySchema = z.object({
  key: z.string(),
  userId: z.string(),
  description: z.string(),
  expiresAt: z.string().nullable(),
})

export const provisionedAssistantSchema = z
  .object({
    tools: z.array(z.string()),
    tags: z.array(z.string()),
    prompts: z.array(z.string()),
    systemPrompt: z.string(),
    temperature: z.number(),
    name: z.string(),
    model: z.string(),
    backendId: z.string(),
    tokenLimit: z.number(),
    description: z.string(),
    reasoning_effort: z.enum(schema.reasoningEffortValues).nullable().optional(),
    owner: z.string(),
    icon: z.string().optional(),
  })
  .strict()

export const provisionedAssistantSharingSchema = z
  .object({
    workspaceId: z.string().nullable(),
    assistantId: z.string(),
  })
  .strict()

export const provisionSchema = z.object({
  tools: z.record(z.string(), provisionedToolSchema).optional(),
  backends: z.record(z.string(), provisionedBackendSchema).optional(),
  users: z.record(z.string(), provisionedUserSchema).optional(),
  apiKeys: z.record(z.string(), provisionedApiKeySchema).optional(),
  assistants: z.record(z.string(), provisionedAssistantSchema).optional(),
  assistantSharing: z.record(z.string(), provisionedAssistantSharingSchema).optional(),
})
