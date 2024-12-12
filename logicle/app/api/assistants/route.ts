import { createAssistant, getAssistantsWithOwner } from '@/models/assistant'
import { requireAdmin, requireSession, SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  return NextResponse.json(await getAssistantsWithOwner({}))
})

export const POST = requireSession(async (session: SimpleSession, req: Request) => {
  const assistant = (await req.json()) as dto.InsertableAssistant
  const created = await createAssistant({
    ...assistant,
    owner: session.userId,
  })
  return ApiResponses.created(created)
})
