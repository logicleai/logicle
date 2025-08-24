import {
  assistantSharingData,
  getAssistant,
  getAssistantDraft,
  getAssistantVersion,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { canEditAssistant } from '@/lib/rbac'
import { getUserWorkspaceMemberships } from '@/models/user'

export const POST = requireSession(
  async (session: SimpleSession, _req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (!assistant.publishedVersionId) {
      return ApiResponses.noSuchEntity(`assistant with id ${assistantId} is not published`)
    }
    const assistantVersion = await getAssistantVersion(assistant.publishedVersionId)
    if (!assistantVersion) {
      return ApiResponses.noSuchEntity(`Can't find published assistant version`)
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
        `You're not authorized to modify assistant ${params.assistantId}`
      )
    }
    await db
      .updateTable('Assistant')
      .set({ draftVersionId: assistant.publishedVersionId })
      .where('Assistant.id', '=', assistantId)
      .execute()

    const assistantPatched = {
      ...assistant,
      draftVersionId: assistant.publishedVersionId,
    }

    return ApiResponses.json(
      await getAssistantDraft(assistantPatched, assistantVersion, sharingData)
    )
  }
)
