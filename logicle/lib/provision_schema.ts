import { z } from 'zod'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { insertableBackendSchema } from '@/types/validation/backend'
import { insertableToolSchema } from '@/types/validation/tool'

export const provisionedToolSchema = insertableToolSchema
  .extend({
    capability: z.boolean().optional(),
  })
  .partial({
    description: true,
    configuration: true,
    tags: true,
    promptFragment: true,
    icon: true,
    sharing: true,
  })
  .strict()

export const provisionedBackendSchema = insertableBackendSchema

export const provisionableUserSchema = dto.insertableUserSchema
  .pick({
    name: true,
    email: true,
    password: true,
    role: true,
  })
  .extend({
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
  users: z.record(z.string(), provisionableUserSchema).optional(),
  apiKeys: z.record(z.string(), provisionedApiKeySchema).optional(),
  assistants: z.record(z.string(), provisionedAssistantSchema).optional(),
  assistantSharing: z.record(z.string(), provisionedAssistantSharingSchema).optional(),
})
