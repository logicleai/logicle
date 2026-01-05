import * as z from 'zod'

export const privateSharingSchema = z.object({
  type: z.literal('private'),
})

export const publicSharingSchema = z.object({
  type: z.literal('public'),
})

const workspaceSharingSchema = z.object({
  type: z.literal('workspace'),
  workspaces: z.array(z.string()),
})

export const sharing2Schema = z.discriminatedUnion('type', [
  privateSharingSchema,
  publicSharingSchema,
  workspaceSharingSchema,
])

export const toolSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.unknown()),
  tags: z.array(z.string()),
  icon: z.string().nullable(),
  sharing: sharing2Schema,
  provisioned: z.number(),
  capability: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  promptFragment: z.string(),
})

export const insertableToolSchema = toolSchema.omit({
  id: true,
  provisioned: true,
  createdAt: true,
  updatedAt: true,
  capability: true,
})

export const updateableToolSchema = insertableToolSchema
  .omit({
    type: true,
  })
  .partial()

export type Tool = z.infer<typeof toolSchema>

export type InsertableTool = z.infer<typeof insertableToolSchema>

export type UpdateableTool = z.infer<typeof updateableToolSchema>
