import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import * as satelliteHub from '@/lib/satelliteHub'

export const GET = requireSession(async (_session: SimpleSession, _req: Request) => {
  const result = Array.from(satelliteHub.connections.values()).map((conn) => {
    return {
      name: conn.name,
      methods: conn.methods,
    }
  })

  return ApiResponses.json(result)
})
