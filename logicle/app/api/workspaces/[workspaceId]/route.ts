import { requireAdmin } from '@/api/utils/auth'
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'

// Get a workspace by slug
export const GET = requireAdmin(
  async (req: Request, route: { params: { workspaceId: string } }) => {
    const workspace = await getWorkspace({ workspaceId: route.params.workspaceId })
    return ApiResponses.json(workspace)
  }
)

// Update a workspace
export const PUT = requireAdmin(
  async (req: Request, route: { params: { workspaceId: string } }) => {
    const workspace = (await req.json()) as dto.Workspace
    await updateWorkspace(route.params.workspaceId, {
      name: workspace.name,
      slug: workspace.slug,
      domain: workspace.domain,
    })
    const updatedWorkspace = await getWorkspace({ workspaceId: route.params.workspaceId })
    return ApiResponses.json(updatedWorkspace)
  }
)

// Delete a workspace
export const DELETE = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  await deleteWorkspace(route.params.slug)
  return ApiResponses.success()
})
