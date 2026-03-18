import { z } from 'zod'
import { route, operation, responseSpec, ok } from '@/lib/routes'
import { makeExpiryDate, setSessionCookie } from '@/lib/auth/session'
import { updateSessionExpiry } from '@/models/session'

const refreshResponseSchema = z.object({
  expiresAt: z.string(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Refresh Session',
    description: 'Refresh session cookie.',
    authentication: 'user',
    preventCrossSite: true,
    responses: [responseSpec(200, refreshResponseSchema)] as const,
    implementation: async (_req, _params, { session }) => {
      const expiresAt = makeExpiryDate()
      await updateSessionExpiry(session.sessionId, expiresAt)
      await setSessionCookie(session.sessionId, expiresAt)
      return ok({
        expiresAt: expiresAt.toISOString(),
      })
    },
  }),
})
