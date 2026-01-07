import { ok, operation, responseSpec, route } from '@/lib/routes'
import { createAssistant, getAssistantsWithOwner } from '@/models/assistant'
import { insertableAssistantDraftSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List assistants',
    description: 'List all assistants.',
    authentication: 'admin',
    responses: [responseSpec(200)] as const,
    implementation: async () => {
      return ok(await getAssistantsWithOwner({}))
    },
  }),
  POST: operation({
    name: 'Create assistant',
    description: 'Create a new assistant draft.',
    authentication: 'user',
    requestBodySchema: insertableAssistantDraftSchema,
    responses: [responseSpec(201)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const created = await createAssistant(requestBody, session.userId)
      return ok(created, 201)
    },
  }),
})
