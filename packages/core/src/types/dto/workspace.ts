import { z } from 'zod'
import { WorkspaceRole } from '../workspace'
import { iso8601UtcDateTimeSchema } from './common'

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  domain: z.string().nullable(),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
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

export const workspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  role: z.nativeEnum(WorkspaceRole),
  createdAt: iso8601UtcDateTimeSchema,
  updatedAt: iso8601UtcDateTimeSchema,
  name: z.string(),
  email: z.string(),
})

export const insertableWorkspaceMemberSchema = workspaceMemberSchema.pick({
  userId: true,
  role: true,
})

export const updateableWorkspaceMemberSchema = workspaceMemberSchema.pick({
  role: true,
})

export type InsertableWorkspaceMember = z.infer<typeof insertableWorkspaceMemberSchema>
export type UpdateableWorkspaceMember = z.infer<typeof updateableWorkspaceMemberSchema>
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>
export type WorkspaceWithMemberCount = Workspace & { memberCount: number }
