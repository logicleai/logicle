import { notFound, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { getPublishedAssistantVersion } from 'models/assistant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'Get assistant system prompt',
    description: 'Fetch the system prompt for a published assistant.',
    authentication: 'user',
    responses: [
      responseSpec(200, z.object({ systemPrompt: z.string() })),
      errorSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { assistantId: string }) => {
      const assistantId = params.assistantId
      const assistant = await getPublishedAssistantVersion(assistantId)
      if (!assistant) {
        return notFound()
      }
      return ok({ systemPrompt: assistant.systemPrompt })
    },
  }),
})
