import { deleteApiKey, getUserApiKey } from '@/models/apikey'
import { interpretDbException, KnownDbErrorCode } from '@/db/exception'
import { conflict, forbidden, noBody, notFound, operation, responseSpec, route } from '@/lib/routes'

export const { DELETE } = route({
  DELETE: operation({
    name: 'Delete user API key',
    description: 'Delete a specific API key for a user.',
    authentication: 'admin',
    responses: [
      responseSpec(204),
      responseSpec(403),
      responseSpec(404),
      responseSpec(409),
    ] as const,
    implementation: async (_req: Request, params: { userId: string; apiKey: string }) => {
      const apiKey = await getUserApiKey(params.userId, params.apiKey)
      if (!apiKey) {
        return notFound(`There is no api key with id ${params.apiKey} for user ${params.userId}`)
      }
      if (apiKey.provisioned) {
        return forbidden("Can't delete a provisioned api key")
      }

      try {
        const result = await deleteApiKey(params.userId, params.apiKey)
        if (result[0].numDeletedRows.toString() !== '1') {
          return notFound(`No such api key ${params.apiKey} for user ${params.userId}`)
        }
      } catch (e) {
        if (interpretDbException(e) === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY) {
          return conflict('User has some activitity which is not deletable')
        }
        throw e
      }
      return noBody()
    },
  }),
})
