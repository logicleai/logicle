import { ok, operation, responseSpec } from '@/lib/routes'
import * as satelliteHub from '@/lib/satellite/hub'
import { UserRole } from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List satellites',
  description: 'List satellite connections.',
  authentication: 'user',
  responses: [
    responseSpec(
      200,
      z
        .object({
          name: z.string(),
          userId: z.string(),
          tools: z.array(z.any()),
        })
        .array()
    ),
  ] as const,
  implementation: async ({ session }) => {
    const isAdmin = session.userRole === UserRole.ADMIN
    const result = Array.from(satelliteHub.connections.values())
      .filter((conn) => isAdmin || conn.userId === session.userId)
      .map((conn) => ({
        name: conn.name,
        userId: conn.userId,
        tools: conn.tools,
      }))
    return ok(result)
  },
})
