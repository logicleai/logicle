import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { canUserAccessAssistant, getPublishedAssistantVersion } from 'models/assistant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get assistant system prompt',
  description: 'Fetch the system prompt for a published assistant.',
  authentication: 'user',
  responses: [
    responseSpec(200, z.object({ systemPrompt: z.string() })),
    errorSpec(403),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session }) => {
    const assistantId = params.assistantId
    if (!(await canUserAccessAssistant(session.userId, assistantId))) {
      return forbidden()
    }
    const assistant = await getPublishedAssistantVersion(assistantId)
    if (!assistant) {
      return notFound()
    }
    return ok({ systemPrompt: assistant.systemPrompt })
  },
})
