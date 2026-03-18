import { conflict, noBody, notFound, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { deleteUserSessionById, getUserSessionById } from '@/models/session'

export const dynamic = 'force-dynamic'

export const { DELETE } = route({
  DELETE: operation({
    name: 'Delete session',
    description: 'Delete an active session owned by the current user.',
    authentication: 'user',
    responses: [responseSpec(204), errorSpec(404), errorSpec(409)] as const,
    implementation: async (_req: Request, params: { sessionId: string }, { session }) => {
      if (params.sessionId === session.sessionId) {
        return conflict('Cannot delete the current session')
      }
      const existing = await getUserSessionById(session.userId, params.sessionId)
      if (!existing) {
        return notFound('No such session')
      }
      await deleteUserSessionById(session.userId, params.sessionId)
      return noBody()
    },
  }),
})
