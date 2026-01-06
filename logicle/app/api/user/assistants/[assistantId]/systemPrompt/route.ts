import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { getPublishedAssistantVersion } from 'models/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'Get assistant system prompt',
    description: 'Fetch the system prompt for a published assistant.',
    authentication: 'user',
    implementation: async (_req: Request, params: { assistantId: string }) => {
      const assistantId = params.assistantId
      const assistant = await getPublishedAssistantVersion(assistantId)
      if (!assistant) {
        return ApiResponses.noSuchEntity()
      }
      return { systemPrompt: assistant.systemPrompt }
    },
  }),
})
