import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import * as sidecarHub from '../../../lib/sidecarHub'

export const GET = requireSession(async (_session: SimpleSession, _req: Request) => {
  return ApiResponses.json(Object.fromEntries(sidecarHub.sidecars))
})
