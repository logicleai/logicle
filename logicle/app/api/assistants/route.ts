import { createAssistant, getAssistantsWithOwner } from '@/models/assistant'
import { requireAdmin, requireSession, SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { insertableAssistantDraftSchema } from '@/types/validation/assistant'

export const dynamic = 'force-dynamic'

export const GET = requireAdmin(async () => {
  return NextResponse.json(await getAssistantsWithOwner({}))
})

export const POST = requireSession(async (session: SimpleSession, req: Request) => {
  const result = insertableAssistantDraftSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const created = await createAssistant(result.data, session.userId)
  return ApiResponses.created(created)
})
