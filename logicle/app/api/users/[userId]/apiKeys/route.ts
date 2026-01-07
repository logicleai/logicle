import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { apiKeySchema, insertableUserApiKeySchema } from '@/types/dto'

export const { GET, POST } = route({
  GET: operation({
    name: 'List user API keys',
    description: 'Fetch all API keys for a user.',
    authentication: 'admin',
    responses: [responseSpec(200, apiKeySchema.array()), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }) => {
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
  }),
  POST: operation({
    name: 'Create user API key',
    description: 'Create a new API key for a user.',
    authentication: 'admin',
    requestBodySchema: insertableUserApiKeySchema,
    responses: [responseSpec(201, apiKeySchema), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }, { requestBody }) => {
      const user = await getUserById(params.userId)
      if (!user) {
        return notFound(`There is no user with id ${params.userId}`)
      }
      const key = nanoid()
      const hashed = await hashPassword(key)
      const apiKey = await createApiKey(params.userId, hashed, requestBody)
      return ok({
        ...apiKey,
        key: key,
      }, 201)
    },
  }),
})
