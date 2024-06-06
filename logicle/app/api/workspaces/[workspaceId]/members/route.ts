import { requireAdmin } from '@/api/utils/auth'
import {
  addWorkspaceMember,
  getWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
} from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import { NextRequest } from 'next/server'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { getUserById } from '@/models/user'
import { WorkspaceMembers } from '@/app/admin/workspaces/components/WorkspaceMembers'
import { AddWorkspaceMemberRequest } from '@/types/dto'
import { request } from 'http'

// Get members of a workspace
export const GET = requireAdmin(
  async (req: Request, route: { params: { workspaceId: string } }) => {
    const members = (await getWorkspaceMembers(route.params.workspaceId)).map((memberShip) => {
      return {
        ...memberShip,
        role: memberShip.role,
      }
    })
    return ApiResponses.json(members)
  }
)

// Delete the member from the workspace
export const DELETE = requireAdmin(
  async (req: NextRequest, route: { params: { workspaceId: string } }) => {
    const memberId = req.nextUrl.searchParams.get('memberId') ?? ''
    const workspace = await getWorkspace({ workspaceId: route.params.workspaceId })
    await removeWorkspaceMember(workspace.id, memberId)
    return ApiResponses.success()
  }
)

export const POST = requireAdmin(
  async (req: Request, route: { params: { workspaceId: string } }) => {
    const workspace = await getWorkspace({ workspaceId: route.params.workspaceId })
    const newMembers = (await req.json()) as AddWorkspaceMemberRequest[]
    try {
      for (const newMember of newMembers) {
        await addWorkspaceMember(workspace.id, newMember.userId, newMember.role)
      }
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code == KnownDbErrorCode.DUPLICATE_KEY
      ) {
        return ApiResponses.conflict(`some members are already member of this workspace`)
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
