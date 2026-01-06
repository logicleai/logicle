import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import {
  assistantSharingData,
  getAssistant,
  getAssistantDraft,
  getAssistantVersion,
} from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import { assistantDraftSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'Get assistant draft by version',
    description: 'Fetch draft for a specific assistant version.',
    authentication: 'user',
    responseBodySchema: assistantDraftSchema,
    implementation: async (_req: Request, params: { assistantVersionId: string }, { session }) => {
      const userId = session.userId
      const assistantVersion = await getAssistantVersion(params.assistantVersionId)
      if (!assistantVersion) {
        return ApiResponses.noSuchEntity(`No such assistant version`)
      }
      const assistant = await getAssistant(assistantVersion.assistantId)
      if (!assistant) {
        return ApiResponses.noSuchEntity(
          `There is no assistant with id ${assistantVersion.assistantId}`
        )
      }
      const sharingData = await assistantSharingData(assistant.id)
      const workspaceMemberships = await getUserWorkspaceMemberships(userId)
      if (
        !canEditAssistant(
          { owner: assistant.owner ?? '', sharing: sharingData },
          session.userId,
          workspaceMemberships
        )
      ) {
        return ApiResponses.notAuthorized(
          `You're not authorized to see assistant ${assistantVersion.assistantId}`
        )
      }
      return await getAssistantDraft(assistant, assistantVersion, sharingData)
    },
  }),
})
