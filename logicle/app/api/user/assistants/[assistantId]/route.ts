import Assistants from 'models/assistant'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { Session } from 'next-auth'
import { NextRequest } from 'next/server'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
    const assistants = await Assistants.withUserData({
      assistantId,
      userId: session.userId,
      workspaceIds: enabledWorkspaces.map((w) => w.id),
    })
    if (assistants.length == 0) {
      return ApiResponses.noSuchEntity()
    }
    return ApiResponses.json(assistants[0])
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const userData = (await req.json()) as Partial<dto.AssistantUserDataDto>
    //const currentUserData = Assistants.userData(assistantId, userId)
    await Assistants.updateUserData(assistantId, userId, userData)
    return ApiResponses.success()
  }
)
