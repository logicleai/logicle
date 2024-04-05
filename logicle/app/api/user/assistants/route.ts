import { NextResponse } from 'next/server'
import Assistants from 'models/assistant'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  // TODO: only mine!!!
  return NextResponse.json(await Assistants.allWithOwner({ userId: session.user.id }))
})
