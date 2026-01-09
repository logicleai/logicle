import { NextResponse } from 'next/server'
import { z } from 'zod'
import { route, operation, responseSpec, errorSpec, error, ok } from '@/lib/routes'
import { refreshSessionFromCookies, setSessionCookie } from '@/lib/auth/session'

const refreshResponseSchema = z.object({
  refreshed: z.boolean(),
  expiresAt: z.string(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Refresh Session',
    description: 'Refresh session cookie if it is near expiration.',
    authentication: 'user',
    preventCrossSite: true,
    responses: [responseSpec(200, refreshResponseSchema), errorSpec(401)] as const,
    implementation: async () => {
      const result = await refreshSessionFromCookies()
      if (!result) {
        return error(401, 'Not authenticated')
      }
      const body = {
        refreshed: result.refreshed,
        expiresAt: result.expiresAt.toISOString(),
      }
      if (!result.refreshed) {
        return ok(body)
      }
      const res = NextResponse.json(body)
      setSessionCookie(res, result.sessionId, result.expiresAt)
      return res
    },
  }),
})
