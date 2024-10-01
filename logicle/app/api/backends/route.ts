import { createBackend, getBackends } from '@/models/backend'
import { requireAdmin, requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { protectApiKey } from '@/types/secure'
import env from '@/lib/env'

export const GET = requireSession(async () => {
  const backends = await getBackends()
  const result = backends.map(protectApiKey)
  return ApiResponses.json(result)
})

export const POST = requireAdmin(async (req: Request) => {
  if (env.backends.locked) {
    return ApiResponses.forbiddenAction('Unable to create the backen: configuration locked')
  }
  try {
    const created = await createBackend(await req.json())
    return ApiResponses.created(created)
  } catch (e) {
    return ApiResponses.internalServerError('Creation failed')
  }
})
