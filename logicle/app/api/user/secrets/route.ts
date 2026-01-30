import { createUserSecret, listUserSecretStatuses } from '@/models/userSecrets'
import { insertableUserSecretSchema, userSecretStatusSchema } from '@/types/dto/usersecret'
import { conflict, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { interpretDbException, KnownDbErrorCode } from '@/db/exception'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List user secrets',
    description: 'List user secret status for the current user.',
    authentication: 'user',
    responses: [responseSpec(200, userSecretStatusSchema.array())] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const secrets = await listUserSecretStatuses(session.userId)
      return ok(secrets)
    },
  }),
  POST: operation({
    name: 'Create user secret',
    description: 'Create a user secret for the current user.',
    authentication: 'user',
    requestBodySchema: insertableUserSecretSchema,
    responses: [responseSpec(201, userSecretStatusSchema), errorSpec(400), errorSpec(409)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      try {
        const stored = await createUserSecret(
          session.userId,
          requestBody.context,
          requestBody.type,
          requestBody.label,
          requestBody.value
        )
        return ok(
          {
            id: stored.id,
            context: stored.context,
            type: requestBody.type,
            label: stored.label,
            readable: true,
          },
          201
        )
      } catch (error) {
        if (interpretDbException(error) === KnownDbErrorCode.DUPLICATE_KEY) {
          return conflict('Secret already exists for this context and type')
        }
        throw error
      }
    },
  }),
})
