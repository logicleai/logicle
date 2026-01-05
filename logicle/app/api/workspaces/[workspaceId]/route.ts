import { requireAdmin } from '@/api/utils/auth'
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'

// Get a workspace by slug
export const GET = requireAdmin(async (_req: Request, params: { workspaceId: string }) => {
  const workspace = await getWorkspace({ workspaceId: params.workspaceId })
  return ApiResponses.json(workspace)
})

// Update a workspace
export const PUT = requireAdmin(async (req: Request, params: { workspaceId: string }) => {
  const result = dto.updateableWorkspaceSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  await updateWorkspace(params.workspaceId, result.data)
  const updatedWorkspace = await getWorkspace({ workspaceId: params.workspaceId })
  return ApiResponses.json(updatedWorkspace)
})

// Delete a workspace
export const DELETE = requireAdmin(async (_req: Request, params: { workspaceId: string }) => {
  await deleteWorkspace(params.workspaceId)
  return ApiResponses.success()
})
