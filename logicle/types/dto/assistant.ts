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
export const AssistantVersionSchema = z.object({
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
})

/**
 * AssistantDraft:
 * Omit AssistantVersion: imageId | tags | prompts
 * + extra fields
 */
export const assistantDraftSchema = AssistantVersionSchema.omit({
  imageId: true,
  tags: true,
  prompts: true,
}).extend({
  owner: z.string(),
  tools: z.array(z.string()),
  files: z.array(assistantFileSchema),
  sharing: z.array(sharingSchema),
  tags: z.array(z.string()),
  prompts: z.array(z.string()),
  iconUri: z.string().nullable(),
  provisioned: z.number(),
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
  provisioned: z.number(),
})

export interface AssistantTool {
  id: string
  name: string
  capability: number
  provisioned: number
  visible: boolean
}

export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
}

export type AssistantVersion = schema.AssistantVersion & {
  current: boolean
  published: boolean
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
  provisioned: number
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
