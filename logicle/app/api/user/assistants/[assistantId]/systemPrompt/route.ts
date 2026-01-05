import { getPublishedAssistantVersion } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (_session: SimpleSession, _req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await getPublishedAssistantVersion(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity()
    }
    return ApiResponses.json({ systemPrompt: assistant.systemPrompt })
  }
)
