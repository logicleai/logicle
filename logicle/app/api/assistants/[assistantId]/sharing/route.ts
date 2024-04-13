import Assistants from '@/models/assistant'
import { requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { Session } from 'next-auth'
import { db } from '@/db/database'

export const POST = requireSession(
  async (session: Session, req: Request, route: { params: { assistantId: string } }) => {
    const assistantId = route.params.assistantId
    const assistant = await Assistants.get(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (assistant.owner !== session.user.id) {
      return ApiResponses.notAuthorized(`You're not authorized to modify assistant ${assistantId}`)
    }
    const sharingList = (await req.json()) as dto.Sharing[]
    await db.deleteFrom('AssistantSharing').where('assistantId', '=', assistantId).execute()
    if (sharingList.length != 0) {
      await db
        .insertInto('AssistantSharing')
        .values(
          sharingList.map((sharing) => {
            return {
              assistantId: assistantId,
              workspaceId: sharing.type == 'workspace' ? sharing.workspaceId : null,
            }
          })
        )
        .execute()
    }

    const sharingData =
      (await Assistants.sharingData([route.params.assistantId])).get(route.params.assistantId) || []
    return ApiResponses.json(sharingData)
  }
)
