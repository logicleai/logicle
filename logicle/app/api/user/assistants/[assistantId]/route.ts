import { noBody, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { getUserAssistants, updateAssistantUserData } from 'models/assistant'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import env from '@/lib/env'
import { llmModels } from '@/lib/models'
import { textExtractors } from '@/lib/textextraction'
import * as dto from '@/types/dto'
import { userAssistantWithMediaSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, PATCH } = route({
  GET: operation({
    name: 'Get assistant for user',
    description: 'Fetch an assistant accessible to the current user.',
    authentication: 'user',
    responses: [responseSpec(200, userAssistantWithMediaSchema), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
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
      return {
        ...assistant,
        supportedMedia: [
          ...toolSupportedMedia,
          ...modelSupportedMedia,
          ...envSupportedMedia,
          ...visionMedia,
          ...conversionSupportedMedia,
        ],
      } as any
    },
  }),
  PATCH: operation({
    name: 'Update assistant user data',
    description: 'Update user-specific assistant data.',
    authentication: 'user',
    requestBodySchema: dto.updateableAssistantUserDataSchema,
    responses: [responseSpec(204)] as const,
    implementation: async (
      _req: Request,
      params: { assistantId: string },
      { session, requestBody }
    ) => {
      await updateAssistantUserData(params.assistantId, session.userId, requestBody)
      return noBody()
    },
  }),
})
