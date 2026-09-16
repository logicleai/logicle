import * as z from 'zod'
import { iso8601UtcDateTimeSchema } from './common'
import type { Sharing2 } from './sharing'

export const privateSharingSchema = z.object({
  type: z.literal('private'),
}).meta({ id: 'ToolSharingPrivate' })

export const publicSharingSchema = z.object({
  type: z.literal('public'),
}).meta({ id: 'ToolSharingPublic' })

const workspaceSharingSchema = z.object({
  type: z.literal('workspace'),
  workspaces: z.array(z.string()),
}).meta({ id: 'ToolSharingWorkspace' })

export const sharing2Schema = z.discriminatedUnion('type', [
  privateSharingSchema,
  publicSharingSchema,
  workspaceSharingSchema,
]).meta({ id: 'ToolSharing' })

// Kept as an alias for consumers that need to describe the sharing policy of
// any PermissionTarget. Tool DTOs continue to expose the same `sharing` field.
export const permissionTargetSharingSchema = sharing2Schema
export type PermissionTargetSharing = Sharing2

export const toolSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  icon: z.string().nullable(),
  sharing: permissionTargetSharingSchema,
  provisioned: z.boolean(),
  capability: z.boolean(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
  promptFragment: z.string(),
}).meta({ id: 'Tool' })

export const insertableToolSchema = toolSchema.omit({
  id: true,
  provisioned: true,
  createdAt: true,
  updatedAt: true,
  capability: true,
}).meta({ id: 'InsertableTool' })

export const updateableToolSchema = insertableToolSchema
  .omit({
    type: true,
  })
  .partial()
  .meta({ id: 'UpdateableTool' })

export type Tool = z.infer<typeof toolSchema>

export type InsertableTool = z.infer<typeof insertableToolSchema>

export type UpdateableTool = z.infer<typeof updateableToolSchema>
