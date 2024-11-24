import { NextResponse } from 'next/server'
import Assistants from '@/models/assistant'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

/// List the assistants created by the session user
export const GET = requireSession(async (session) => {
  return NextResponse.json(await Assistants.withOwner({ userId: session.userId }))
})
