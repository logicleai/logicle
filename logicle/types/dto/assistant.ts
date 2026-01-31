import { z } from 'zod'
import * as schema from '../../db/schema'
import { Sharing } from './sharing'

export const assistantFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
})

/** Sharing */
export const allSharingSchema = z.object({
  type: z.literal('all'),
})

const workspaceSharingSchema = z.object({
  type: z.literal('workspace'),
  workspaceId: z.string(),
  workspaceName: z.string(),
})

export const sharingSchema = z.discriminatedUnion('type', [
  allSharingSchema,
  workspaceSharingSchema,
])

/** Matches your AssistantVersion interface */
export const assistantVersionSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  backendId: z.string(),
  description: z.string(),
  imageId: z.string().nullable(),
  model: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  temperature: z.number(),
  tokenLimit: z.number(),
  reasoning_effort: z.enum(['low', 'medium', 'high']).nullable(),
  tags: z.string(),
  prompts: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  current: z.boolean(),
  published: z.boolean(),
})

export type AssistantVersion = z.infer<typeof assistantVersionSchema>

/**
 * AssistantDraft:
 * Omit AssistantVersion: imageId | tags | prompts
 * + extra fields
 */
export const assistantDraftSchema = assistantVersionSchema
  .omit({
    imageId: true,
    tags: true,
    prompts: true,
    current: true,
    published: true,
  })
  .extend({
    owner: z.string(),
    tools: z.array(z.string()),
    files: z.array(assistantFileSchema),
    sharing: z.array(sharingSchema),
    tags: z.array(z.string()),
    prompts: z.array(z.string()),
    iconUri: z.string().nullable(),
    provisioned: z.boolean(),
    pendingChanges: z.boolean(),
  })

export const insertableAssistantDraftSchema = assistantDraftSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  owner: true,
  sharing: true,
  provisioned: true,
  assistantId: true,
  pendingChanges: true,
})

export const updateableAssistantDraftSchema = insertableAssistantDraftSchema.partial()

export const assistantSharingSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  workspaceId: z.string().nullable(),
  provisioned: z.boolean(),
})

export const assistantToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  capability: z.boolean(),
  provisioned: z.boolean(),
  visible: z.boolean(),
})

export type AssistantTool = z.infer<typeof assistantToolSchema>

export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
}

export type AssistantDraft = z.infer<typeof assistantDraftSchema>

export type InsertableAssistantDraft = z.infer<typeof insertableAssistantDraftSchema>

export type UpdateableAssistantDraft = z.infer<typeof updateableAssistantDraftSchema>

export type AssistantWithOwner = Omit<schema.AssistantVersion, 'imageId' | 'tags' | 'prompts'> & {
  owner: string
  ownerName: string
  modelName: string
  sharing: Sharing[]
  tags: string[]
  prompts: string[]
  iconUri: string | null
  provisioned: boolean
}

export const assistantUserDataSchema = z.object({
  pinned: z.boolean(),
  lastUsed: z.string().nullable(), // consider .datetime().nullable() if ISO is guaranteed
})

export const updateableAssistantUserDataSchema = assistantUserDataSchema
  .omit({ lastUsed: true })
  .partial()

export type AssistantUserData = z.infer<typeof assistantUserDataSchema>

export type UpdateableAssistantUserData = z.infer<typeof updateableAssistantUserDataSchema>

export const assistantOwnerSchema = z.string()

export const assistantIdentificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUri: z.string().nullable(),
})

export type AssistantIdentification = z.infer<typeof assistantIdentificationSchema>

export const assistantUsabilitySchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('usable'),
  }),
  z.object({
    state: z.literal('need-api-key'),
    backendId: z.string(),
    backendName: z.string(),
  }),
  z.object({
    state: z.literal('not-usable'),
    constraint: z.string(),
  }),
])

export type AssistantUsability = z.infer<typeof assistantUsabilitySchema>

export const userAssistantSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUri: z.string().nullable(),
  versionId: z.string(),
  backendId: z.string(),
  description: z.string(),
  model: z.string(),
  usability: assistantUsabilitySchema,
  pinned: z.boolean(),
  lastUsed: z.string().nullable(),
  owner: z.string(),
  ownerName: z.string(),
  tags: z.array(z.string()),
  prompts: z.array(z.string()),
  sharing: sharingSchema.array(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cloneable: z.boolean(),
  tokenLimit: z.number(),
  tools: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      availability: z.enum(['ok', 'require-auth']),
    })
  ),
  pendingChanges: z.boolean(),
})

export type UserAssistant = z.infer<typeof userAssistantSchema>

export const userAssistantWithMediaSchema = userAssistantSchema.extend({
  supportedMedia: z.array(z.string()),
})

export type UserAssistantWithSupportedMedia = z.infer<typeof userAssistantWithMediaSchema>
