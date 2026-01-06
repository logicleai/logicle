import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { deleteWorkspace, getWorkspace, updateWorkspace } from '@/models/workspace'
import * as dto from '@/types/dto'

// Get a workspace by slug
export const { GET, PUT, DELETE } = route({
  GET: operation({
    name: 'Get workspace',
    description: 'Fetch a workspace.',
    authentication: 'admin',
    responseBodySchema: dto.workspaceSchema,
    implementation: async (_req: Request, params: { workspaceId: string }) => {
      const workspace = await getWorkspace({ workspaceId: params.workspaceId })
      return workspace
    },
  }),
  PUT: operation({
    name: 'Update workspace',
    description: 'Update a workspace.',
    authentication: 'admin',
    requestBodySchema: dto.updateableWorkspaceSchema,
    responseBodySchema: dto.workspaceSchema,
    implementation: async (_req: Request, params: { workspaceId: string }, { requestBody }) => {
      await updateWorkspace(params.workspaceId, requestBody)
      const updatedWorkspace = await getWorkspace({ workspaceId: params.workspaceId })
      return updatedWorkspace
    },
  }),
  DELETE: operation({
    name: 'Delete workspace',
    description: 'Delete a workspace.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { workspaceId: string }) => {
      await deleteWorkspace(params.workspaceId)
      return ApiResponses.success()
    },
  }),
})
