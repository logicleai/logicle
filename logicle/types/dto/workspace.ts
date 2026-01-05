import * as schema from '@/db/schema'
import { z } from 'zod'
import { WorkspaceRole } from '../workspace'

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

export interface AddWorkspaceMemberRequest {
  userId: string
  role: WorkspaceRole
}

export const workspaceMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  role: z.nativeEnum(WorkspaceRole),
  createdAt: z.string(),
  updatedAt: z.string(),
  name: z.string(),
  email: z.string(),
})

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>
export type WorkspaceWithMemberCount = schema.Workspace & { memberCount: number }
