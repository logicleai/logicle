import { ok, operation, responseSpec } from '@/lib/routes'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import env from '@/lib/env'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get token rate limit status',
  description: 'Returns the current token usage window and rate limit status for the calling user.',
  authentication: 'user',
  responses: [responseSpec(200, dto.tokenRateLimitSchema)] as const,
  implementation: async ({ session }) => {
    const { windowSeconds, windowTokens } = env.rateLimit

    if (!windowSeconds || !windowTokens) {
      return ok({ enabled: false } satisfies dto.TokenRateLimit)
    }

    const row = await db
      .selectFrom('UserTokenWindow')
      .selectAll()
      .where('userId', '=', session.userId)
      .executeTakeFirst()

    const now = Date.now()
    const windowStart = row ? new Date(row.tokenWindowStart).getTime() : now
    const windowExpired = now > windowStart + windowSeconds * 1000

    const accumulated = windowExpired ? 0 : (row?.tokenWindowAccumulated ?? 0)
    const effectiveWindowStart = windowExpired ? now : windowStart

    return ok({
      enabled: true,
      accumulated,
      threshold: windowTokens,
      windowStart: new Date(effectiveWindowStart).toISOString(),
      windowEnd: new Date(effectiveWindowStart + windowSeconds * 1000).toISOString(),
      exceeded: accumulated >= windowTokens,
    } satisfies dto.TokenRateLimit)
  },
})
