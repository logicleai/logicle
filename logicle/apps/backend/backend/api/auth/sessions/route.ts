import { ok, operation, responseSpec, route } from '@/lib/routes'
import { listUserSessions } from '@/models/session'
import { sessionSummarySchema } from '@/types/dto/session'

export const dynamic = 'force-dynamic'

export const { GET } = route({
  GET: operation({
    name: 'List my sessions',
    description: 'Fetch active sessions for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, sessionSummarySchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const sessions = await listUserSessions(session.userId, new Date())
      return ok(
        sessions.map((storedSession) => ({
          id: storedSession.id,
          createdAt: storedSession.createdAt,
          expiresAt: storedSession.expiresAt,
          lastSeenAt: storedSession.lastSeenAt ?? null,
          userAgent: storedSession.userAgent ?? null,
          ipAddress: storedSession.ipAddress ?? null,
          authMethod: storedSession.authMethod,
          idpConnectionId: storedSession.idpConnectionId,
          isCurrent: storedSession.id === session.sessionId,
        }))
      )
    },
  }),
})
