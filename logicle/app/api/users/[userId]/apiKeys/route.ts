import { getUserById } from '@/models/user'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'

export const GET = requireAdmin(async (_req: Request, params: { userId: string }) => {
  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
  }
  const apiKeys: Omit<dto.ApiKey, 'key'>[] = (await getUserApiKeys(params.userId)).map((apiKey) => {
    return {
      ...apiKey,
      key: '<hidden>',
    }
  })
  return ApiResponses.json(apiKeys)
})

export const POST = requireAdmin(async (req: Request, params: { userId: string }) => {
  const reqBody = (await req.json()) as dto.InsertableApiKey
  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
  }
  const apiKey = await createApiKey(params.userId, nanoid(), reqBody.description)
  return ApiResponses.created({
    ...apiKey,
  })
})
