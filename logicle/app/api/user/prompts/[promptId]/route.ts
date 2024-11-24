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
  if (prompt.ownerId != session.userId) {
    return ApiResponses.forbiddenAction("Can't access the prompt of another user")
  }
  return ApiResponses.json(prompt)
})

// Save prompt
export const PUT = requireSession(async (session, req, params: { promptId: string }) => {
  const prompt = (await req.json()) as dto.Prompt
  const dbPrompt = await getPrompt(params.promptId)
  if (dbPrompt && dbPrompt.ownerId != session.userId) {
    return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
  }
  if (params.promptId !== prompt.id) {
    return ApiResponses.error(
      400,
      'The data provided is not consistent with the path. Check the IDs'
    )
  }
  if (prompt.ownerId !== session.userId) {
    return ApiResponses.conflict()
  }
  await updatePrompt(prompt.id, prompt)
  return ApiResponses.success()
})

// Delete prompt
export const DELETE = requireSession(async (session, req, params: { promptId: string }) => {
  const dbPrompt = await getPrompt(params.promptId)
  if (dbPrompt && dbPrompt.ownerId != session.userId) {
    return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
  }
  await deletePrompt(params.promptId)
  return ApiResponses.success()
})
