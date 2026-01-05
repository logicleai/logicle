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
  const result = dto.insertableApiKeySchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const reqBody: dto.InsertableApiKey = result.data
  const user = await getUserById(params.userId)
  if (!user) {
    return ApiResponses.noSuchEntity(`There is no user with id ${params.userId}`)
  }
  const apiKey = await createApiKey(params.userId, nanoid(), reqBody.description)
  return ApiResponses.created({
    ...apiKey,
  })
})
