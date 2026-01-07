import { defaultErrorResponse, interpretDbException } from '@/db/exception'
import { forbidden, noBody, notFound, operation, responseSpec, route } from '@/lib/routes'
import { deleteApiKey, getApiKey } from '@/models/apikey'

export const dynamic = 'force-dynamic'

export const { DELETE } = route({
  DELETE: operation({
    name: 'Delete my API key',
    description: 'Delete an API key owned by the current user.',
    authentication: 'user',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { id: string }, { session }) => {
      const existingApiKey = await getApiKey(params.id)
      if (!existingApiKey) {
        return notFound('No such API key')
      }
      if (existingApiKey.provisioned) {
        return forbidden("Can't delete a provisioned tool")
      }
      if (existingApiKey.userId !== session.userId) {
        return forbidden("Can't delete a non owned api key")
      }
      try {
        await deleteApiKey(session.userId, params.id)
      } catch (e) {
        const interpretedException = interpretDbException(e)
        return defaultErrorResponse(interpretedException)
      }
      return noBody()
    },
  }),
})
