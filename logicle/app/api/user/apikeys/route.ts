import { ok, operation, responseSpec, route } from '@/lib/routes'
import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'
import { apiKeySchema, insertableUserApiKeySchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List my API keys',
    description: 'Fetch API keys for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, apiKeySchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      return ok(
        (await getUserApiKeys(session.userId)).map((apiKey) => {
          return {
            ...apiKey,
            key: '<hidden>',
          }
        })
      )
    },
  }),
  POST: operation({
    name: 'Create my API key',
    description: 'Create a new API key for the current user.',
    authentication: 'user',
    requestBodySchema: insertableUserApiKeySchema,
    responses: [responseSpec(201, apiKeySchema)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const key = nanoid()
      const hashed = await hashPassword(key)
      const apiKey = await createApiKey(session.userId, hashed, requestBody)
      return ok({
        ...apiKey,
        key: key,
      }, 201)
    },
  }),
})
