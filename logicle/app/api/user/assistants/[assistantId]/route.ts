import Assistants from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '@/app/api/utils/auth'
import { Session } from 'next-auth'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export type AssistantUserDataDto = {
  pinned: boolean
  lastUsed?: string
}

export const GET = requireSession(
  async (session: Session, req: NextRequest, route: { params: { assistantId: string } }) => {
    const assistantId = route.params.assistantId
    const assistant = await Assistants.get(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity()
    }
    const dbData = await Assistants.userData(route.params.assistantId, session.user.id)
    let userData: AssistantUserDataDto
    if (dbData == null) {
      userData = {
        pinned: false,
      }
    } else {
      userData = {
        pinned: dbData.pinned != 0,
        lastUsed: dbData.lastUsed ?? undefined,
      }
    }
    return ApiResponses.json({
      ...assistant,
      ...userData,
    })
  }
)

export const PATCH = requireSession(
  async (session: Session, req: NextRequest, route: { params: { assistantId: string } }) => {
    const assistantId = route.params.assistantId
    const userId = session.user.id
    const userData = (await req.json()) as Partial<AssistantUserDataDto>
    //const currentUserData = Assistants.userData(assistantId, userId)
    Assistants.updateUserData(assistantId, userId, {
      ...userData,
      pinned: userData.pinned ? 1 : 0,
    })
    return ApiResponses.success()
  }
)
