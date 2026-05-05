import * as z from 'zod'
import { iso8601UtcDateTimeSchema } from './common'

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

export const toolSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  icon: z.string().nullable(),
  sharing: sharing2Schema,
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
