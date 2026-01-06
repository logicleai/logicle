import ApiResponses from '@/api/utils/ApiResponses'
import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'
import { getUserById } from '@/models/user'
import { route, operation } from '@/lib/routes'
import { apiKeySchema, insertableUserApiKeySchema } from '@/types/dto'

export const { GET, POST } = route({
  GET: operation({
    name: 'List user API keys',
    description: 'Fetch all API keys for a user.',
    authentication: 'admin',
    responseBodySchema: apiKeySchema.array(),
    implementation: async (_req: Request, params: { userId: string }) => {
      const user = await getUserById(params.userId)
      if (!user) {
        return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
      }
      return (await getUserApiKeys(params.userId)).map((apiKey) => {
        return {
          ...apiKey,
          key: '<hidden>',
        }
      })
    },
  }),
  POST: operation({
    name: 'Create user API key',
    description: 'Create a new API key for a user.',
    authentication: 'admin',
    requestBodySchema: insertableUserApiKeySchema,
    responseBodySchema: apiKeySchema,
    implementation: async (_req: Request, params: { userId: string }, { requestBody }) => {
      const user = await getUserById(params.userId)
      if (!user) {
        return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
      }
      const key = nanoid()
      const hashed = await hashPassword(key)
      const apiKey = await createApiKey(params.userId, hashed, requestBody)
      return {
        ...apiKey,
        key: key,
      }
    },
  }),
})
