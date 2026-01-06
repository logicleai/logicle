import ApiResponses from '@/api/utils/ApiResponses'
import { route, operation } from '@/lib/routes'
import { deletePrompt, getPrompt, updatePrompt } from '@/models/prompt'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, PUT, DELETE } = route({
  GET: operation({
    name: 'Get user prompt',
    description: 'Fetch a prompt by id for the current user.',
    authentication: 'user',
    responseBodySchema: dto.promptSchema,
    implementation: async (_req: Request, params: { promptId: string }, { session }) => {
      const prompt = await getPrompt(params.promptId as string)
      if (!prompt) {
        return ApiResponses.noSuchEntity()
      }
      if (prompt.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction("Can't access the prompt of another user")
      }
      return prompt
    },
  }),
  PUT: operation({
    name: 'Update user prompt',
    description: 'Replace a prompt for the current user.',
    authentication: 'user',
    requestBodySchema: dto.insertablePromptSchema,
    implementation: async (
      _req: Request,
      params: { promptId: string },
      { session, requestBody }
    ) => {
      const prompt = requestBody
      const dbPrompt = await getPrompt(params.promptId)
      if (dbPrompt && dbPrompt.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
      }
      await updatePrompt(params.promptId, prompt)
      return ApiResponses.success()
    },
  }),
  DELETE: operation({
    name: 'Delete user prompt',
    description: 'Delete a prompt for the current user.',
    authentication: 'user',
    implementation: async (_req: Request, params: { promptId: string }, { session }) => {
      const dbPrompt = await getPrompt(params.promptId)
      if (dbPrompt && dbPrompt.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction("Can't overwrite the prompt of another user")
      }
      await deletePrompt(params.promptId)
      return ApiResponses.success()
    },
  }),
})
