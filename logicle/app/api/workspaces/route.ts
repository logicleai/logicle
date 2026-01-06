import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { slugify } from '@/lib/common'
import { route, operation } from '@/lib/routes'
import { createWorkspace, getWorkspaces } from '@/models/workspace'
import { insertableWorkspaceSchema, workspaceSchema } from '@/types/dto'

// Get workspaces
export const { GET, POST } = route({
  GET: operation({
    name: 'List workspaces',
    description: 'Fetch all workspaces.',
    authentication: 'admin',
    responseBodySchema: workspaceSchema.array(),
    implementation: async () => {
      const workspaces = await getWorkspaces()
      return workspaces
    },
  }),
  POST: operation({
    name: 'Create workspace',
    description: 'Create a workspace.',
    authentication: 'admin',
    requestBodySchema: insertableWorkspaceSchema,
    responseBodySchema: workspaceSchema,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const name = requestBody.name
      const slug = slugify(name)
      try {
        const workspace = await createWorkspace({
          userId: session.userId,
          name,
          slug,
        })
        return workspace
      } catch (e) {
        const interpretedException = interpretDbException(e)
        if (
          interpretedException instanceof KnownDbError &&
          interpretedException.code === KnownDbErrorCode.DUPLICATE_KEY
        ) {
          return ApiResponses.conflict(`A workspace with the same slug ${slug} already exists`)
        }
        return defaultErrorResponse(interpretedException)
      }
    },
  }),
})
