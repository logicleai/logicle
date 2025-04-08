import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import env from '@/lib/env'

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
    const supportedMedia = (await availableToolsForAssistant(assistantId)).flatMap(
      (t) => t.supportedMedia
    )
    const supportedMediaFromEnv = env.chat.attachments.allowedFormats.split(',')
    return ApiResponses.json({
      ...assistants[0],
      supportedMedia: [...supportedMedia, ...supportedMediaFromEnv],
    })
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const userData = (await req.json()) as Partial<dto.AssistantUserDataDto>
    //const currentUserData = Assistants.userData(assistantId, userId)
    await updateAssistantUserData(assistantId, userId, userData)
    return ApiResponses.success()
  }
)
