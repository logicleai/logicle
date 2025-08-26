import {
  assistantSharingData,
  getAssistant,
  getAssistantVersion,
  getAssistantDraft,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { getUserWorkspaceMemberships } from '@/models/user'
import { canEditAssistant } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, _req: Request, params: { assistantVersionId: string }) => {
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
    return ApiResponses.json(await getAssistantDraft(assistant, assistantVersion, sharingData))
  }
)
