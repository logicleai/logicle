import { route, operation, ok, noBody, error, responseSpec } from '@/lib/routes'
import { deletePrompt, getPrompt, updatePrompt } from '@/models/prompt'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET, PUT, DELETE } = route({
  GET: operation({
    name: 'Get user prompt',
    description: 'Fetch a prompt by id for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, dto.promptSchema), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { promptId: string }, { session }) => {
      const prompt = await getPrompt(params.promptId as string)
      if (!prompt) {
        return error(404, 'blabla')
      }
      if (prompt.ownerId !== session.userId) {
        return error(403, "Can't access the prompt of another user")
      }
      return ok(prompt)
    },
  }),
  PUT: operation({
    name: 'Update user prompt',
    description: 'Replace a prompt for the current user.',
    authentication: 'user',
    requestBodySchema: dto.insertablePromptSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (
      _req: Request,
      params: { promptId: string },
      { session, requestBody }
    ) => {
      const prompt = requestBody
      const dbPrompt = await getPrompt(params.promptId)
      if (!dbPrompt) {
        return error(404)
      }
      if (dbPrompt.ownerId !== session.userId) {
        return error(403, "Can't overwrite the prompt of another user")
      }
      await updatePrompt(params.promptId, prompt)
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete user prompt',
    description: 'Delete a prompt for the current user.',
    authentication: 'user',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { promptId: string }, { session }) => {
      const dbPrompt = await getPrompt(params.promptId)
      if (!dbPrompt) {
        return error(404)
      }
      if (dbPrompt.ownerId !== session.userId) {
        return error(403, "Can't overwrite the prompt of another user")
      }
      await deletePrompt(params.promptId)
      return noBody()
    },
  }),
})
