import { requireAdmin } from '@/api/utils/auth'
import { getWorkspace } from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import { WorkspaceRole } from '@/types/workspace'
import { db } from 'db/database'
import { updateableWorkspaceMemberSchema } from '@/types/dto/workspace'

export const PATCH = requireAdmin(
  async (req: Request, params: { workspaceId: string; userId: string }) => {
    const result = updateableWorkspaceMemberSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    const workspace = await getWorkspace({ workspaceId: params.workspaceId })
    await db
      .updateTable('WorkspaceMember')
      .set(result.data)
      .where((eb) =>
        eb.and([eb('userId', '=', params.userId), eb('workspaceId', '=', workspace.id)])
      )
      .execute()
    return ApiResponses.success()
  }
)
