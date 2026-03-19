import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { apiKeySchema, insertableUserApiKeySchema } from '@/types/dto'

export const GET = operation({
  name: 'List user API keys',
  description: 'Fetch all API keys for a user.',
  authentication: 'admin',
  responses: [responseSpec(200, apiKeySchema.array()), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const user = await getUserById(params.userId)
    if (!user) {
      return notFound(`There is no user with id ${params.userId}`)
    }
    return ok(
      (await getUserApiKeys(params.userId)).map((apiKey) => {
        return {
          ...apiKey,
          key: '<hidden>',
        }
      })
    )
  },
})

export const POST = operation({
  name: 'Create user API key',
  description: 'Create a new API key for a user.',
  authentication: 'admin',
  requestBodySchema: insertableUserApiKeySchema,
  responses: [responseSpec(201, apiKeySchema), errorSpec(404)] as const,
  implementation: async ({ params, requestBody }) => {
    const user = await getUserById(params.userId)
    if (!user) {
      return notFound(`There is no user with id ${params.userId}`)
    }
    const key = nanoid()
    const hashed = await hashPassword(key)
    const apiKey = await createApiKey(params.userId, hashed, requestBody)
    return ok(
      {
        ...apiKey,
        key: key,
      },
      201
    )
  },
})
