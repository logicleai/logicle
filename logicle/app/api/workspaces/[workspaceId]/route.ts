import { noBody, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/models/workspace'
import * as dto from '@/types/dto'

// Get a workspace by slug
export const { GET, PUT, DELETE } = route({
  GET: operation({
    name: 'Get workspace',
    description: 'Fetch a workspace.',
    authentication: 'admin',
    responses: [responseSpec(200, dto.workspaceSchema)] as const,
    implementation: async (_req: Request, params: { workspaceId: string }) => {
      const workspace = await getWorkspace({ workspaceId: params.workspaceId })
      return ok(workspace)
    },
  }),
  PUT: operation({
    name: 'Update workspace',
    description: 'Update a workspace.',
    authentication: 'admin',
    requestBodySchema: dto.updateableWorkspaceSchema,
    responses: [responseSpec(200, dto.workspaceSchema)] as const,
    implementation: async (_req: Request, params: { workspaceId: string }, { requestBody }) => {
      await updateWorkspace(params.workspaceId, requestBody)
      const updatedWorkspace = await getWorkspace({ workspaceId: params.workspaceId })
      return ok(updatedWorkspace)
    },
  }),
  DELETE: operation({
    name: 'Delete workspace',
    description: 'Delete a workspace.',
    authentication: 'admin',
    responses: [responseSpec(204)] as const,
    implementation: async (_req: Request, params: { workspaceId: string }) => {
      await deleteWorkspace(params.workspaceId)
      return noBody()
    },
  }),
})
