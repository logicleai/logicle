import { createPrompt, getPrompts } from '@/models/prompt'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

// Fetch prompts
export const GET = requireSession(async (session) => {
  const prompts = await getPrompts(session.userId)
  return ApiResponses.json(prompts)
})

export const POST = requireSession(async (session, req) => {
  const prompt = (await req.json()) as dto.InsertablePrompt
  const created = await createPrompt({
    ...prompt,
    ownerId: session.userId,
  })
  return ApiResponses.created(created)
})
