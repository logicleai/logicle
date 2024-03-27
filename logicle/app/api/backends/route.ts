import { createBackend, getBackends } from 'models/backend'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { protectBackend } from '@/types/secure'
import env from '@/lib/env'

export const GET = requireAdmin(async () => {
  const backends = await getBackends()
  const result = backends.map(protectBackend)
  return ApiResponses.json(result)
})

export const POST = requireAdmin(async (req: Request) => {
  if (env.backends.locked) {
    return ApiResponses.forbiddenAction('backends_locked')
  }
  try {
    const created = await createBackend(await req.json())
    return ApiResponses.created(created)
  } catch (e) {
    return ApiResponses.internalServerError('Creation failed')
  }
})
