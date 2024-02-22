import { createBackend, getBackends } from 'models/backend'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { protectBackend } from '@/types/secure'

export const GET = requireAdmin(async () => {
  const backends = await getBackends()
  const result = backends.map(protectBackend)
  return ApiResponses.json(result)
})

export const POST = requireAdmin(async (req: Request) => {
  try {
    const created = await createBackend(await req.json())
    return ApiResponses.created(created)
  } catch (e) {
    return ApiResponses.internalServerError('Creation failed')
  }
})
