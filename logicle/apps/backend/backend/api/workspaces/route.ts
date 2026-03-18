import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import { slugify } from '@/lib/common'
import { conflict, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { createWorkspace, getWorkspaces } from '@/models/workspace'
import { insertableWorkspaceSchema, workspaceSchema } from '@/types/dto'

// Get workspaces
export const { GET, POST } = route({
  GET: operation({
    name: 'List workspaces',
    description: 'Fetch all workspaces.',
    authentication: 'admin',
    responses: [responseSpec(200, workspaceSchema.array())] as const,
    implementation: async () => {
      const workspaces = await getWorkspaces()
      return ok(workspaces)
    },
  }),
  POST: operation({
    name: 'Create workspace',
    description: 'Create a workspace.',
    authentication: 'admin',
    requestBodySchema: insertableWorkspaceSchema,
    responses: [responseSpec(201, workspaceSchema), errorSpec(409)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const name = requestBody.name
      const slug = slugify(name)
      try {
        const workspace = await createWorkspace({
          userId: session.userId,
          name,
          slug,
        })
        return ok(workspace, 201)
      } catch (e) {
        if (interpretDbException(e) === KnownDbErrorCode.DUPLICATE_KEY) {
          return conflict(`A workspace with the same slug ${slug} already exists`)
        }
        throw e
      }
    },
  }),
})
