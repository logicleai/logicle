import { noBody, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { logger } from '@/lib/logging'
import {
  assistantVersionFiles,
  getPublishedAssistantVersion,
  getUserAssistants,
  updateAssistantUserData,
} from 'models/assistant'
import { availableToolsForAssistantVersion } from '@/backend/lib/tools/enumerate'
import env from '@/lib/env'
import { llmModels } from '@/lib/models'
import { textExtractors } from '@/lib/textextraction'
import * as dto from '@/types/dto'
import { userAssistantWithMediaSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get assistant for user',
  description: 'Fetch an assistant accessible to the current user.',
  authentication: 'user',
  responses: [responseSpec(200, userAssistantWithMediaSchema), errorSpec(404)] as const,
  implementation: async ({ params, session }) => {
    const assistantId = params.assistantId
    const assistants = await getUserAssistants(
      {
        assistantId,
        userId: session.userId,
      },
      'published'
    )
    if (assistants.length === 0) {
      return notFound()
    }
    const assistant = assistants[0]
    const publishedAssistantVersion = await getPublishedAssistantVersion(assistantId)
    if (!publishedAssistantVersion) {
      return notFound()
    }

    const capabilities = llmModels.find((m) => m.id === assistant.model)?.capabilities
    const visionMedia = capabilities?.vision
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : []
    const modelSupportedMedia = capabilities?.supportedMedia ?? []
    const envSupportedMedia = env.chat.attachments.allowedFormats
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    const conversionSupportedMedia = Object.keys(textExtractors)

    let files: dto.AssistantFile[] = []
    try {
      files = await assistantVersionFiles(publishedAssistantVersion.id)
    } catch (error) {
      logger.error('Failed loading assistant files for user assistant route', {
        assistantId,
        assistantVersionId: publishedAssistantVersion.id,
        sessionUserId: session.userId,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      })
    }

    let toolSupportedMedia: string[] = []
    try {
      toolSupportedMedia = (
        await availableToolsForAssistantVersion(assistant.versionId, assistant.model)
      ).flatMap((t) => t.supportedMedia)
    } catch (error) {
      logger.error('Failed loading assistant tools for user assistant route', {
        assistantId,
        assistantVersionId: assistant.versionId,
        assistantModel: assistant.model,
        sessionUserId: session.userId,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      })
    }

    return ok({
      ...assistant,
      systemPrompt: publishedAssistantVersion.systemPrompt,
      files,
      supportedMedia: [
        ...toolSupportedMedia,
        ...modelSupportedMedia,
        ...envSupportedMedia,
        ...visionMedia,
        ...conversionSupportedMedia,
      ],
    })
  },
})

export const PATCH = operation({
  name: 'Update assistant user data',
  description: 'Update user-specific assistant data.',
  authentication: 'user',
  requestBodySchema: dto.updateableAssistantUserDataSchema,
  responses: [responseSpec(204)] as const,
  implementation: async ({ params, session, requestBody }) => {
    await updateAssistantUserData(params.assistantId, session.userId, requestBody)
    return noBody()
  },
})
