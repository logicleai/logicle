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
  const result = dto.insertablePromptSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const created = await createPrompt(session.userId, result.data)
  return ApiResponses.created(created)
})
