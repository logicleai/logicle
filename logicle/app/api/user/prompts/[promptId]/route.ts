import { getPrompt, deletePrompt, updatePrompt } from '@/models/prompt'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '@/app/api/utils/auth'

export const dynamic = 'force-dynamic'

// Fetch prompt
export const GET = requireSession(async (session, _, params: { promptId: string }) => {
  const prompt = await getPrompt(params.promptId as string)
  if (!prompt) {
    return ApiResponses.noSuchEntity()
  }
  if (prompt.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction("Can't access the prompt of another user")
  }
  return ApiResponses.json(prompt)
})

// Save prompt
export const PUT = requireSession(async (session, req, params: { promptId: string }) => {
  const result = dto.insertablePromptSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const prompt = result.data
  const dbPrompt = await getPrompt(params.promptId)
  if (dbPrompt && dbPrompt.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
  }
  await updatePrompt(params.promptId, prompt)
  return ApiResponses.success()
})

// Delete prompt
export const DELETE = requireSession(async (session, _req, params: { promptId: string }) => {
  const dbPrompt = await getPrompt(params.promptId)
  if (dbPrompt && dbPrompt.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
  }
  await deletePrompt(params.promptId)
  return ApiResponses.success()
})
