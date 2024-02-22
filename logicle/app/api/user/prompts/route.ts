import { createPrompt, getPrompts } from 'models/prompt'
import ApiResponses from '@/api/utils/ApiResponses'
import { InsertablePrompt } from '@/types/db'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

// Fetch prompts
export const GET = requireSession(async (session) => {
  const prompts = await getPrompts(session.user.id)
  return ApiResponses.json(prompts)
})

export const POST = requireSession(async (session, req) => {
  const prompt = (await req.json()) as InsertablePrompt
  const created = await createPrompt({
    ...prompt,
    ownerId: session.user.id,
  })
  return ApiResponses.created(created)
})
