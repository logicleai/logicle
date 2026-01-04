import { z } from 'zod'

/** AssistantFile */
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

export const workspaceSharingSchema = z.object({
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
  createdAt: z.string(),
  updatedAt: z.string(),
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

/**
 * InsertableAssistantDraft:
 * Omit from AssistantDraft:
 * id | createdAt | updatedAt | owner | sharing | provisioned | assistantId | pendingChanges
 */
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
