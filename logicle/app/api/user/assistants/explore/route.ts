import { NextResponse } from 'next/server'
import { getUserAssistants } from '@/models/assistant'
import { requireSession } from '@/api/utils/auth'
import { getUserWorkspaceMemberships } from '@/models/user'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
  const assistants = await getUserAssistants(
    {
      userId: session.userId,
      workspaceIds: enabledWorkspaces.map((w) => w.id),
    },
    'published'
  )
  return NextResponse.json(assistants)
})
