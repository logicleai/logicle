import { requireAdmin } from '@/api/utils/auth'
import { getWorkspace } from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import { WorkspaceRole } from '@/types/workspace'
import { db } from 'db/database'

export const PATCH = requireAdmin(
  async (req: Request, params: { workspaceId: string; userId: string }) => {
    const workspace = await getWorkspace({ workspaceId: params.workspaceId })
    const { role } = (await req.json()) as {
      role: WorkspaceRole
    }

    await db
      .updateTable('WorkspaceMember')
      .set({ role: role })
      .where((eb) =>
        eb.and([eb('userId', '=', params.userId), eb('workspaceId', '=', workspace.id)])
      )
      .execute()
    return ApiResponses.success()
  }
)
