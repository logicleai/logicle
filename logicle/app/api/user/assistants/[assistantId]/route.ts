import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import { getUserWorkspaceMemberships } from '@/models/user'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import env from '@/lib/env'
import { llmModels } from '@/lib/models'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
    const assistants = await getUserAssistants(
      {
        assistantId,
        userId: session.userId,
        workspaceIds: enabledWorkspaces.map((w) => w.id),
      },
      'published'
    )
    if (assistants.length == 0) {
      return ApiResponses.noSuchEntity()
    }
    const assistant = assistants[0]
    const supportedMedia = (
      await availableToolsForAssistantVersion(assistant.versionId, assistant.model)
    ).flatMap((t) => t.supportedMedia)
    const visionMedia = llmModels.find((m) => m.id == assistant.model)
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
