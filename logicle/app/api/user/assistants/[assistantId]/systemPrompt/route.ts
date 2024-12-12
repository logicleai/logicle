import Assistants from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await Assistants.get(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity()
    }
    return ApiResponses.json({ systemPrompt: assistant.systemPrompt })
  }
)
