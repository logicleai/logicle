import { requireAdmin } from '@/api/utils/auth'
import {
  addWorkspaceMember,
  getWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
} from 'models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import { NextRequest } from 'next/server'
import { WorkspaceRole } from '@/types/workspace'
import { db } from 'db/database'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { getUserById } from 'models/user'

// Get members of a workspace
export const GET = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const members = (await getWorkspaceMembers(route.params.slug)).map((memberShip) => {
    return {
      ...memberShip,
      role: memberShip.role,
    }
  })
  return ApiResponses.json(members)
})

// Delete the member from the workspace
export const DELETE = requireAdmin(
  async (req: NextRequest, route: { params: { slug: string } }) => {
    const memberId = req.nextUrl.searchParams.get('memberId') ?? ''
    const workspace = await getWorkspace({ slug: route.params.slug })
    await removeWorkspaceMember(workspace.id, memberId)
    return ApiResponses.success()
  }
)

interface AddWorkspaceMemberRequest {
  userId: string
  role: WorkspaceRole
}

export const POST = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const workspace = await getWorkspace({ slug: route.params.slug })
  const workspaceMember = (await req.json()) as AddWorkspaceMemberRequest
  const user = await getUserById(workspaceMember.userId)
  if (!user) {
    return ApiResponses.invalidParameter(`Invalid user id`)
  }
  const role = workspaceMember.role
  try {
    await addWorkspaceMember(workspace.id, workspaceMember.userId, workspaceMember.role)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.conflict(`${user.name} is already a member of this workspace`)
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const workspace = await getWorkspace({ slug: route.params.slug })
  const { memberId, role } = (await req.json()) as {
    memberId: string
    role: WorkspaceRole
  }

  await db
    .updateTable('WorkspaceMember')
    .set({ role: role })
    .where((eb) => eb.and([eb('userId', '=', memberId), eb('workspaceId', '=', workspace.id)]))
    .execute()
  return ApiResponses.success()
})
