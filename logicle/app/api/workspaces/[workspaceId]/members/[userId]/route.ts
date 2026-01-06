import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { getWorkspace } from '@/models/workspace'
import { WorkspaceRole } from '@/types/workspace'
import { db } from 'db/database'
import { updateableWorkspaceMemberSchema } from '@/types/dto/workspace'

export const { PATCH } = route({
  PATCH: operation({
    name: 'Update workspace member',
    description: 'Update a workspace member role.',
    authentication: 'admin',
    requestBodySchema: updateableWorkspaceMemberSchema,
    implementation: async (
      _req: Request,
      params: { workspaceId: string; userId: string },
      { requestBody }
    ) => {
      const workspace = await getWorkspace({ workspaceId: params.workspaceId })
      await db
        .updateTable('WorkspaceMember')
        .set(requestBody)
        .where((eb) =>
          eb.and([eb('userId', '=', params.userId), eb('workspaceId', '=', workspace.id)])
        )
        .execute()
      return ApiResponses.success()
    },
  }),
})
