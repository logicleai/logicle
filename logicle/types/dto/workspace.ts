import { z } from 'zod'

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  domain: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const insertableWorkspaceSchema = workspaceSchema.omit({
  id: true,
  slug: true,
  domain: true,
  createdAt: true,
  updatedAt: true,
})

export const updateableWorkspaceSchema = workspaceSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial()

export type Workspace = z.infer<typeof workspaceSchema>
export type InsertableWorkspace = z.infer<typeof insertableWorkspaceSchema>
export type UpdateableWorkspace = z.infer<typeof updateableWorkspaceSchema>
