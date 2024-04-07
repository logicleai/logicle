import { NextResponse } from 'next/server'
import Assistants from '@/models/assistant'
import { requireSession } from '@/api/utils/auth'
import { getUserWorkspaces } from '@/models/user'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const enabledWorkspaces = await getUserWorkspaces(session.user.id)
  const assistants = await Assistants.withUserData({
    userId: session.user.id,
    workspaceIds: enabledWorkspaces.map((w) => w.id),
  })
  return NextResponse.json(assistants)
})
