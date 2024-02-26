import Assistants from 'models/assistant' // Import the helper functions
import { requireAdmin } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { InsertableAssistantWithTools } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  return NextResponse.json(await Assistants.all())
})

export const POST = requireAdmin(async (req: Request) => {
  const assistant = (await req.json()) as InsertableAssistantWithTools
  const created = await Assistants.create(assistant)
  return ApiResponses.created(created)
})
