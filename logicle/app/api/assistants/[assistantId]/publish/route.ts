import { getAssistant } from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'

export const POST = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (assistant.owner !== session.userId) {
      return ApiResponses.notAuthorized(`You're not authorized to modify assistant ${assistantId}`)
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
