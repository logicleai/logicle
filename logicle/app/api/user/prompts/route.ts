import { ok, operation, responseSpec, route } from '@/lib/routes'
import { createPrompt, getPrompts } from '@/models/prompt'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  // Fetch prompts
  GET: operation({
    name: 'List user prompts',
    description: 'Fetch prompts for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, dto.promptSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      return ok(await getPrompts(session.userId))
    },
  }),
  POST: operation({
    name: 'Create user prompt',
    description: 'Create a prompt for the current user.',
    authentication: 'user',
    requestBodySchema: dto.insertablePromptSchema,
    responses: [responseSpec(201, dto.promptSchema)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const created = await createPrompt(session.userId, requestBody)
      return ok(created, 201)
    },
  }),
})
