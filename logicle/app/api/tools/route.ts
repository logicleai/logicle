import { error, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { logger } from '@/lib/logging'
import { createTool, getTools } from '@/models/tool'
import { insertableToolSchema, toolSchema } from '@/types/dto/tool'

export const { GET, POST } = route({
  GET: operation({
    name: 'List tools',
    description: 'Fetch all tools.',
    authentication: 'admin',
    responses: [responseSpec(200, toolSchema.array())] as const,
    implementation: async () => {
      return ok(await getTools())
    },
  }),
  POST: operation({
    name: 'Create tool',
    description: 'Create a new tool.',
    authentication: 'admin',
    requestBodySchema: insertableToolSchema,
    responses: [responseSpec(201, toolSchema), errorSpec(500)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      try {
        const created = await createTool(requestBody)
        return ok(created, 201)
      } catch (e) {
        logger.error('Tool creation failed', e)
        return error(500, 'Creation failed')
      }
    },
  }),
})
