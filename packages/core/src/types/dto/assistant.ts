import { z } from 'zod'
import { Sharing } from './sharing'
import { iso8601UtcDateTimeSchema } from './common'

export const assistantFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
  createdAt: iso8601UtcDateTimeSchema.optional(),
  order: z.number().int().nullable().optional(),
}).meta({ id: 'AssistantFile' })

export const compareAssistantFiles = (
  left: z.infer<typeof assistantFileSchema>,
  right: z.infer<typeof assistantFileSchema>
) => {
  const leftOrderDefined = left.order !== undefined && left.order !== null
  const rightOrderDefined = right.order !== undefined && right.order !== null
  if (leftOrderDefined && rightOrderDefined) {
    const leftOrder = left.order as number
    const rightOrder = right.order as number
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
  }
  if (leftOrderDefined !== rightOrderDefined) {
    return leftOrderDefined ? -1 : 1
  }
  const leftCreatedAt = left.createdAt ?? ''
  const rightCreatedAt = right.createdAt ?? ''
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt.localeCompare(rightCreatedAt)
  }
  return left.id.localeCompare(right.id)
}

export const sortAssistantFiles = <T extends z.infer<typeof assistantFileSchema>>(files: T[]): T[] =>
  [...files].sort(compareAssistantFiles)

/** Sharing */
export const allSharingSchema = z.object({
  type: z.literal('all'),
}).meta({ id: 'AssistantSharingAll' })

const workspaceSharingSchema = z.object({
  type: z.literal('workspace'),
  workspaceId: z.string(),
  workspaceName: z.string(),
}).meta({ id: 'AssistantSharingWorkspace' })

export const sharingSchema = z.discriminatedUnion('type', [
  allSharingSchema,
  workspaceSharingSchema,
]).meta({ id: 'AssistantSharing' })

/** Matches your AssistantVersion interface */
export const assistantVersionSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  backendId: z.string(),
  description: z.string(),
  imageId: z.string().nullable(),
  model: z.string(),
  name: z.string(),
  versionName: z.string().nullable().optional(),
  systemPrompt: z.string(),
  temperature: z.number(),
  tokenLimit: z.number(),
  reasoning_effort: z.enum(['low', 'medium', 'high']).nullable(),
  tags: z.string(),
  prompts: z.string(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
  current: z.boolean(),
  published: z.boolean(),
}).meta({ id: 'AssistantVersion' })

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
    subAssistants: z.array(z.string()).optional(),
  })
  .meta({ id: 'AssistantDraft' })

export const insertableAssistantDraftSchema = assistantDraftSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  owner: true,
  sharing: true,
  provisioned: true,
  assistantId: true,
  pendingChanges: true,
}).meta({ id: 'InsertableAssistantDraft' })

export const updateableAssistantDraftSchema = insertableAssistantDraftSchema
  .partial()
  .meta({ id: 'UpdateableAssistantDraft' })

export const assistantSharingSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  workspaceId: z.string().nullable(),
  provisioned: z.boolean(),
}).meta({ id: 'AssistantSharingRow' })

export const assistantToolSchema = z.object({
  id: z.string(),
  name: z.string(),
  capability: z.boolean(),
  provisioned: z.boolean(),
  visible: z.boolean(),
}).meta({ id: 'AssistantTool' })

export type AssistantTool = z.infer<typeof assistantToolSchema>

export interface AssistantFile {
  id: string
  name: string
  type: string
  size: number
  createdAt?: string
  order?: number | null
}

export type AssistantDraft = z.infer<typeof assistantDraftSchema>

export type InsertableAssistantDraft = z.infer<typeof insertableAssistantDraftSchema>

export type UpdateableAssistantDraft = z.infer<typeof updateableAssistantDraftSchema>

export const assistantWithOwnerSchema = z.object({
  id: z.string(),
  assistantId: z.string(),
  backendId: z.string(),
  description: z.string(),
  model: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  temperature: z.number(),
  tokenLimit: z.number(),
  reasoning_effort: z.enum(['low', 'medium', 'high']).nullable(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
  owner: z.string(),
  ownerName: z.string(),
  modelName: z.string(),
  sharing: sharingSchema.array(),
  tags: z.array(z.string()),
  prompts: z.array(z.string()),
  iconUri: z.string().nullable(),
  provisioned: z.boolean(),
}).meta({ id: 'AssistantWithOwner' })

export type AssistantWithOwner = z.infer<typeof assistantWithOwnerSchema>

export const assistantUserDataSchema = z.object({
  pinned: z.boolean(),
  lastUsed: iso8601UtcDateTimeSchema.nullable(),
}).meta({ id: 'AssistantUserData' })

export const updateableAssistantUserDataSchema = assistantUserDataSchema
  .omit({ lastUsed: true })
  .partial()
  .meta({ id: 'UpdateableAssistantUserData' })

export type AssistantUserData = z.infer<typeof assistantUserDataSchema>

export type UpdateableAssistantUserData = z.infer<typeof updateableAssistantUserDataSchema>

export const assistantOwnerSchema = z.string()

export const assistantIdentificationSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUri: z.string().nullable(),
}).meta({ id: 'AssistantIdentification' })

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
]).meta({ id: 'AssistantUsability' })

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
  lastUsed: iso8601UtcDateTimeSchema.nullable(),
  owner: z.string(),
  ownerName: z.string(),
  tags: z.array(z.string()),
  prompts: z.array(z.string()),
  sharing: sharingSchema.array(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
  cloneable: z.boolean(),
  tokenLimit: z.number(),
  tools: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      availability: z.enum(['ok', 'require-auth']),
    })
  ),
  subAssistants: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  pendingChanges: z.boolean(),
}).meta({ id: 'UserAssistant' })

export type UserAssistant = z.infer<typeof userAssistantSchema>

export const userAssistantWithMediaSchema = userAssistantSchema.extend({
  supportedMedia: z.array(z.string()),
  systemPrompt: z.string().optional(),
  files: z.array(assistantFileSchema).optional(),
}).meta({ id: 'UserAssistantWithMedia' })

export type UserAssistantWithSupportedMedia = z.infer<typeof userAssistantWithMediaSchema>
