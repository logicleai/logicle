import { assistantsSharingData, getAssistant } from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { db } from '@/db/database'
import { nanoid } from 'nanoid'

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
    const currentSharingProvisioned = await db
      .selectFrom('AssistantSharing')
      .selectAll()
      .where('assistantId', '=', assistantId)
      .where('provisioned', '=', 1)
      .execute()
    if (currentSharingProvisioned.length !== 0) {
      return ApiResponses.notAuthorized(
        `You're not authorized to modify provisioned sharing of ${assistantId}`
      )
    }
    const sharingList = (await req.json()) as dto.Sharing[]
    await db.deleteFrom('AssistantSharing').where('assistantId', '=', assistantId).execute()
    if (sharingList.length !== 0) {
      await db
        .insertInto('AssistantSharing')
        .values(
          sharingList.map((sharing) => {
            return {
              id: nanoid(),
              assistantId: assistantId,
              workspaceId: sharing.type === 'workspace' ? sharing.workspaceId : null,
              provisioned: 0,
            }
          })
        )
        .execute()
    }

    const sharingData =
      (await assistantsSharingData([params.assistantId])).get(params.assistantId) || []
    return ApiResponses.json(sharingData)
  }
)
