import { KnownDbErrorCode, interpretDbException } from '@/db/exception'
import { slugify } from '@/backend/lib/utils'
import { conflict, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { createWorkspace, getWorkspaces } from '@/models/workspace'
import { insertableWorkspaceSchema, workspaceSchema } from '@/types/dto'

// Get workspaces
export const GET = operation({
  name: 'List workspaces',
  description: 'Fetch all workspaces.',
  authentication: 'admin',
  responses: [responseSpec(200, workspaceSchema.array())] as const,
  implementation: async () => {
    const workspaces = await getWorkspaces()
    return ok(workspaces)
  },
})

export const POST = operation({
  name: 'Create workspace',
  description: 'Create a workspace.',
  authentication: 'admin',
  requestBodySchema: insertableWorkspaceSchema,
  responses: [responseSpec(201, workspaceSchema), errorSpec(409)] as const,
  implementation: async ({ session, body }) => {
    const name = body.name
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
})
