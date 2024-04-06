import Assistants from '@/models/assistant' // Import the helper functions
import { requireAdmin, requireSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { Session } from 'next-auth'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  return NextResponse.json(await Assistants.withOwner({}))
})

export const POST = requireSession(async (session: Session, req: Request, route: any) => {
  const assistant = (await req.json()) as dto.InsertableAssistant
  const created = await Assistants.create({
    ...assistant,
    owner: session.user.id,
  })
  return ApiResponses.created(created)
})
