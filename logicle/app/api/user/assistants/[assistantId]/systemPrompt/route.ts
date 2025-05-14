import { getAssistantVersion } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await getAssistantVersion(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity()
    }
    return ApiResponses.json({ systemPrompt: assistant.systemPrompt })
  }
)
