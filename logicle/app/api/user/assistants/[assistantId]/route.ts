import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import env from '@/lib/env'
import { isVisionModel } from '@/lib/chat/models'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
    const assistants = await getUserAssistants({
      assistantId,
      userId: session.userId,
      workspaceIds: enabledWorkspaces.map((w) => w.id),
    })
    if (assistants.length == 0) {
      return ApiResponses.noSuchEntity()
    }
    const assistant = assistants[0]
    const supportedMedia = (await availableToolsForAssistant(assistantId)).flatMap(
      (t) => t.supportedMedia
    )
    const visionMedia = isVisionModel(assistant.model)
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : []
    const supportedMediaFromEnv = env.chat.attachments.allowedFormats.split(',')
    return ApiResponses.json({
      ...assistant,
      supportedMedia: [...supportedMedia, ...supportedMediaFromEnv, ...visionMedia],
    })
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const { lastUsed, ...safeData } = await req.json()
    await updateAssistantUserData(assistantId, userId, safeData)
    return ApiResponses.success()
  }
)
