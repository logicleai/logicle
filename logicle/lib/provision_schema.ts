import { z } from 'zod'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { insertableBackendSchema } from '@/types/validation/backend'
import { insertableToolSchema } from '@/types/validation/tool'
import { insertableAssistantDraftSchema } from '@/types/validation/assistant'
import { insertableApiKeySchema } from '@/types/validation/apikey'

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

export const provisionedApiKeySchema = insertableApiKeySchema.extend({
  key: z.string(),
})

export const provisionedAssistantSchema = insertableAssistantDraftSchema
  .omit({
    files: true,
    iconUri: true,
  })
  .extend({
    owner: z.string(),
    icon: z.string().optional(),
    reasoning_effort: z.enum(schema.reasoningEffortValues).nullable().optional(),
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
