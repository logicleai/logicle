import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import { conflict, noBody, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import {
  addWorkspaceMember,
  getWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
} from '@/models/workspace'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const GET = operation({
  name: 'List workspace members',
  description: 'Fetch members of a workspace.',
  authentication: 'admin',
  responses: [responseSpec(200, dto.workspaceMemberSchema.array())] as const,
  implementation: async (_req: Request, params: { workspaceId: string }) => {
    const members = await getWorkspaceMembers(params.workspaceId)
    return ok(members)
  },
})

export const DELETE = operation({
  name: 'Remove workspace member',
  description: 'Remove a member from a workspace.',
  authentication: 'admin',
  querySchema: z.object({
    memberId: z.string().optional(),
  }),
  responses: [responseSpec(204)] as const,
  implementation: async (_req: Request, params: { workspaceId: string }, { query }) => {
    const memberId = query.memberId ?? ''
    const workspace = await getWorkspace({ workspaceId: params.workspaceId })
    await removeWorkspaceMember(workspace.id, memberId)
    return noBody()
  },
})

export const POST = operation({
  name: 'Add workspace members',
  description: 'Add members to a workspace.',
  authentication: 'admin',
  requestBodySchema: dto.insertableWorkspaceMemberSchema.array(),
  responses: [responseSpec(204), errorSpec(409)] as const,
  implementation: async (_req: Request, params: { workspaceId: string }, { requestBody }) => {
    const workspace = await getWorkspace({ workspaceId: params.workspaceId })
    const newMembers = requestBody
    try {
      for (const newMember of newMembers) {
        await addWorkspaceMember(workspace.id, newMember.userId, newMember.role)
      }
    } catch (e) {
      if (interpretDbException(e) === KnownDbErrorCode.DUPLICATE_KEY) {
        return conflict(`some members are already member of this workspace`)
      }
      throw e
    }
    return noBody()
  },
})
