import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { createApiKey, getUserApiKeys } from '@/models/apikey'
import { nanoid } from 'nanoid'
import { hashPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session: SimpleSession, _req: Request) => {
  const apiKeys: Omit<dto.ApiKey, 'key'>[] = (await getUserApiKeys(session.userId)).map(
    (apiKey) => {
      return {
        ...apiKey,
        key: '<hidden>',
      }
    }
  )
  return ApiResponses.json(apiKeys)
})

/// Create an api key
export const POST = requireSession(async (session: SimpleSession, req: Request) => {
  const result = dto.insertableUserApiKeySchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const key = nanoid()
  const hashed = await hashPassword(key)
  const apiKey = await createApiKey(session.userId, hashed, result.data)
  return ApiResponses.created({
    ...apiKey,
    key: key,
  })
})
