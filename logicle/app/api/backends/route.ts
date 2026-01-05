import { createBackend, getBackends } from '@/models/backend'
import { requireAdmin, requireSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { protectApiKey } from '@/types/secure'
import env from '@/lib/env'
import * as dto from '@/types/dto'
import { insertableBackendSchema } from '@/types/dto/backend'

export const GET = requireSession(async () => {
  const backends = await getBackends()
  const result = backends.map(protectApiKey)
  return ApiResponses.json(result)
})

export const POST = requireAdmin(async (req: Request) => {
  if (env.backends.locked) {
    return ApiResponses.forbiddenAction('Unable to create the backen: configuration locked')
  }

  const result = insertableBackendSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  try {
    const created = await createBackend(result.data)
    return ApiResponses.created(created)
  } catch {
    return ApiResponses.internalServerError('Creation failed')
  }
})
