import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import env from '@/lib/env'
import { llmModels } from '@/lib/models'
import { textExtractors } from '@/lib/textextraction'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, _req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistants = await getUserAssistants(
      {
        assistantId,
        userId: session.userId,
      },
      'published'
    )
    if (assistants.length === 0) {
      return ApiResponses.noSuchEntity()
    }
    const assistant = assistants[0]
    const toolSupportedMedia = (
      await availableToolsForAssistantVersion(assistant.versionId, assistant.model)
    ).flatMap((t) => t.supportedMedia)
    const capabilities = llmModels.find((m) => m.id === assistant.model)?.capabilities

    const visionMedia = capabilities?.vision
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : []
    const modelSupportedMedia = capabilities?.supportedMedia ?? []
    const envSupportedMedia = env.chat.attachments.allowedFormats.split(',')
    const conversionSupportedMedia = env.chat.enableAttachmentConversion
      ? Object.keys(textExtractors)
      : ''
    return ApiResponses.json({
      ...assistant,
      supportedMedia: [
        ...toolSupportedMedia,
        ...modelSupportedMedia,
        ...envSupportedMedia,
        ...visionMedia,
        ...conversionSupportedMedia,
      ],
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
