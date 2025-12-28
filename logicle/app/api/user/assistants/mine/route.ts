import { NextResponse } from 'next/server'
import { getUserAssistants } from '@/models/assistant'
import { requireSession } from '@/api/utils/auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const assistants = await getUserAssistants(
    {
      userId: session.userId,
    },
    'draft'
  )
  return NextResponse.json(assistants)
})
