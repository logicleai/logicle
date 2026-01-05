import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import env from '@/lib/env'
import { llmModels } from '@/lib/models'
import { textExtractors } from '@/lib/textextraction'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, _req: Request, params: { assistantId: string }) => {
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
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const result = dto.updateableAssistantUserDataSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    await updateAssistantUserData(assistantId, userId, result.data)
    return ApiResponses.success()
  }
)
