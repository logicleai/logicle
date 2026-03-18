import { noBody, notFound, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { deleteUserSecretById } from '@/models/userSecrets'

export const dynamic = 'force-dynamic'

export const { DELETE } = route({
  DELETE: operation({
    name: 'Delete user secret',
    description: 'Remove a user secret for the current user.',
    authentication: 'user',
    responses: [responseSpec(204), errorSpec(400), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { id: string }, { session }) => {
      const deleted = await deleteUserSecretById(session.userId, params.id)
      if (deleted === 0) {
        return notFound('Secret not found')
      }
      return noBody()
    },
  }),
})
