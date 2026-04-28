import { z } from 'zod'
import { operation, responseSpec, ok } from '@/lib/routes'
import { makeExpiryDate, setSessionCookie } from '@/lib/auth/session'
import { updateSessionExpiry } from '@/models/session'
import { iso8601UtcDateTimeSchema } from '@/types/dto/common'

const refreshResponseSchema = z.object({
  expiresAt: iso8601UtcDateTimeSchema,
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Refresh Session',
  description: 'Refresh session cookie.',
  authentication: 'user',
  preventCrossSite: true,
  responses: [responseSpec(200, refreshResponseSchema)] as const,
  implementation: async ({ cookies, session }) => {
    const expiresAt = makeExpiryDate()
    await updateSessionExpiry(session.sessionId, expiresAt)
    setSessionCookie(cookies, session.sessionId, expiresAt)
    return ok({
      expiresAt: expiresAt.toISOString(),
    })
  },
})
