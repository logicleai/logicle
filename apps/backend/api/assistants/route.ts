import { ok, operation, responseSpec } from '@/lib/routes'
import { createAssistant, getAssistantsWithOwner } from '@/models/assistant'
import { insertableAssistantDraftSchema } from '@/types/dto/assistant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List assistants',
  description: 'List all assistants.',
  authentication: 'admin',
  responses: [responseSpec(200, z.any())] as const,
  implementation: async () => {
    return ok(await getAssistantsWithOwner({}))
  },
})

export const POST = operation({
  name: 'Create assistant',
  description: 'Create a new assistant draft.',
  authentication: 'user',
  requestBodySchema: insertableAssistantDraftSchema,
  responses: [responseSpec(201)] as const,
  implementation: async ({ session, body }) => {
    const created = await createAssistant(body, session.userId)
    return ok(created, 201)
  },
})
