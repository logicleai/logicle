import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import * as schema from '@/db/schema'
import { Updateable } from 'kysely'
import { getOrCreateImageFromNullableDataUri } from '@/models/images'
import * as dto from '@/types/dto'
import {
  deleteUserById,
  getUserById,
  getUserParameterValuesAsRecord,
  setUserParameterValues,
  updateUser,
} from '@/models/user'
import { conflict, forbidden, noBody, notFound, ok, operation, responseSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get user',
    description: 'Fetch a specific user.',
    authentication: 'admin',
    responses: [responseSpec(200, dto.userSchema), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }) => {
      const user = await getUserById(params.userId)
      if (!user) {
        return notFound(`There is no user with id ${params.userId}`)
      }
      return ok({
        ...user,
        ssoUser: !!user.ssoUser,
        image: user.imageId ? `/api/images/${user.imageId}` : null,
        properties: await getUserParameterValuesAsRecord(params.userId),
      })
    },
  }),
  PATCH: operation({
    name: 'Update user',
    description: 'Update an existing user.',
    authentication: 'admin',
    requestBodySchema: dto.updateableUserSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { userId: string }, { session, requestBody }) => {
      const user = requestBody
      const currentUser = await getUserById(params.userId)
      if (!currentUser) {
        return notFound(`There is no user with id ${params.userId}`)
      }
      if (currentUser.provisioned) {
        return forbidden("Can't modify a provisioned user")
      }
      if (session.userId === params.userId && user.role) {
        return forbidden("Can't update self role")
      }
      const imageId =
        user.image !== undefined ? await getOrCreateImageFromNullableDataUri(user.image) : undefined

      const dbUser = {
        ...user,
        ssoUser: user.ssoUser ? 1 : 0,
        image: undefined,
        imageId,
        properties: undefined,
      } as Updateable<schema.User>

      await updateUser(params.userId, dbUser)
      if (user.properties) {
        await setUserParameterValues(params.userId, user.properties)
      }
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete user',
    description: 'Delete a specific user.',
    authentication: 'admin',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404), responseSpec(409)] as const,
    implementation: async (_req: Request, params: { userId: string }, { session }) => {
      if (session.userId === params.userId) {
        return forbidden('You cannot delete your own account')
      }
      const currentUser = await getUserById(params.userId)
      if (!currentUser) {
        return notFound(`There is no user with id ${params.userId}`)
      }
      if (currentUser.provisioned) {
        return forbidden("Can't modify a provisioned user")
      }

      try {
        await deleteUserById(params.userId)
      } catch (e) {
        const interpretedException = interpretDbException(e)
        if (
          interpretedException instanceof KnownDbError &&
          interpretedException.code === KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
        ) {
          return conflict('User has some activitity which is not deletable')
        }
        return defaultErrorResponse(interpretedException)
      }
      return noBody()
    },
  }),
})
