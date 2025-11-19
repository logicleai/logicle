import { createAssistant, getAssistantsWithOwner } from '@/models/assistant'
import { requireAdmin, requireSession, SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { getUserById } from '@/models/user'
import { createApiKey, getUserApiKeys } from '@/models/apikey'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session: SimpleSession, _req: Request) => {
  const apiKeys: Omit<dto.ApiKey, 'key'>[] = (await getUserApiKeys(session.userId)).map((apiKey) => {
    return {
      ...apiKey,
      key: '<hidden>',
    }
  })
  return ApiResponses.json(apiKeys)
})

/// Create an api key
export const POST = requireSession(async (session: SimpleSession, req: Request) => {
  const reqBody = (await req.json()) as dto.InsertableApiKey
  const apiKey = await createApiKey(session.userId, reqBody.description)
  return ApiResponses.created({
    ...apiKey,
  })
})
