import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { route, operation } from '@/lib/routes'
import {
  addWorkspaceMember,
  getWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
} from '@/models/workspace'
import * as dto from '@/types/dto'

export const { GET, DELETE, POST } = route({
  GET: operation({
    name: 'List workspace members',
    description: 'Fetch members of a workspace.',
    authentication: 'admin',
    responseBodySchema: dto.workspaceMemberSchema.array(),
    implementation: async (_req: Request, params: { workspaceId: string }) => {
      const members = await getWorkspaceMembers(params.workspaceId)
      return members
    },
  }),
  DELETE: operation({
    name: 'Remove workspace member',
    description: 'Remove a member from a workspace.',
    authentication: 'admin',
    implementation: async (req: Request, params: { workspaceId: string }) => {
      const url = new URL(req.url)
      const memberId = url.searchParams.get('memberId') ?? ''
      const workspace = await getWorkspace({ workspaceId: params.workspaceId })
      await removeWorkspaceMember(workspace.id, memberId)
      return ApiResponses.success()
    },
  }),
  POST: operation({
    name: 'Add workspace members',
    description: 'Add members to a workspace.',
    authentication: 'admin',
    requestBodySchema: dto.insertableWorkspaceMemberSchema.array(),
    implementation: async (_req: Request, params: { workspaceId: string }, { requestBody }) => {
      const workspace = await getWorkspace({ workspaceId: params.workspaceId })
      const newMembers = requestBody
      try {
        for (const newMember of newMembers) {
          await addWorkspaceMember(workspace.id, newMember.userId, newMember.role)
        }
      } catch (e) {
        const interpretedException = interpretDbException(e)
        if (
          interpretedException instanceof KnownDbError &&
          interpretedException.code === KnownDbErrorCode.DUPLICATE_KEY
        ) {
          return ApiResponses.conflict(`some members are already member of this workspace`)
        }
        return defaultErrorResponse(interpretedException)
      }
      return ApiResponses.success()
    },
  }),
})
