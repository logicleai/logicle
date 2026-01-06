import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { logger } from '@/lib/logging'
import { createTool, getTools } from '@/models/tool'
import { insertableToolSchema, toolSchema } from '@/types/dto/tool'

export const { GET, POST } = route({
  GET: operation({
    name: 'List tools',
    description: 'Fetch all tools.',
    authentication: 'admin',
    responseBodySchema: toolSchema.array(),
    implementation: async () => {
      return await getTools()
    },
  }),
  POST: operation({
    name: 'Create tool',
    description: 'Create a new tool.',
    authentication: 'admin',
    requestBodySchema: insertableToolSchema,
    responseBodySchema: toolSchema,
    implementation: async (_req: Request, _params, { requestBody }) => {
      try {
        const created = await createTool(requestBody)
        return ApiResponses.created(created)
      } catch (e) {
        logger.error('Tool creation failed', e)
        return ApiResponses.internalServerError('Creation failed')
      }
    },
  }),
})
