import { ok, operation, responseSpec } from '@/lib/routes'
import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'
import { apiKeySchema, insertableUserApiKeySchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List my API keys',
  description: 'Fetch API keys for the current user.',
  authentication: 'user',
  responses: [responseSpec(200, apiKeySchema.array())] as const,
  implementation: async ({ session }) => {
    return ok(
      (await getUserApiKeys(session.userId)).map((apiKey) => {
        return {
          ...apiKey,
          key: '<hidden>',
        }
      })
    )
  },
})

export const POST = operation({
  name: 'Create my API key',
  description: 'Create a new API key for the current user.',
  authentication: 'user',
  requestBodySchema: insertableUserApiKeySchema,
  responses: [responseSpec(201, apiKeySchema)] as const,
  implementation: async ({ session, body }) => {
    const key = nanoid()
    const hashed = await hashPassword(key)
    const apiKey = await createApiKey(session.userId, hashed, body)
    return ok(
      {
        ...apiKey,
        key: key,
      },
      201
    )
  },
})
