import Assistants from 'models/assistant' // Import the helper functions
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { Session } from 'next-auth'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  return NextResponse.json(await Assistants.allWithOwner())
})

export const POST = requireAdmin(async (req: Request, route: any, session: Session) => {
  const assistant = (await req.json()) as dto.InsertableAssistant
  const created = await Assistants.create({
    ...assistant,
    owner: session.user.id,
  })
  return ApiResponses.created(created)
})
