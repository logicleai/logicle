import { assistantSharingData, getAssistant } from '@/models/assistant'
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
      .set(({ ref }) => ({
        publishedVersionId: ref('draftVersionId'),
      }))
      .where('Assistant.id', '=', assistantId)
      .execute()
    return ApiResponses.json({})
  }
)
