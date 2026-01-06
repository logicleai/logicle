import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { createPrompt, getPrompts } from '@/models/prompt'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  // Fetch prompts
  GET: operation({
    name: 'List user prompts',
    description: 'Fetch prompts for the current user.',
    authentication: 'user',
    responseBodySchema: dto.promptSchema.array(),
    implementation: async (_req: Request, _params, { session }) => {
      return await getPrompts(session.userId)
    },
  }),
  POST: operation({
    name: 'Create user prompt',
    description: 'Create a prompt for the current user.',
    authentication: 'user',
    requestBodySchema: dto.insertablePromptSchema,
    responseBodySchema: dto.promptSchema,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const created = await createPrompt(session.userId, requestBody)
      return ApiResponses.created(created)
    },
  }),
})
