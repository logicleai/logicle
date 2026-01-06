import { createUserRaw, getUserParameterValuesByUser, getUsers } from '@/models/user'
import { hashPassword } from '@/lib/auth'
import { route, operation } from '@/lib/routes'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List users',
    description: 'Fetch all users.',
    authentication: 'admin',
    responseBodySchema: dto.userSchema.array(),
    implementation: async () => {
      const users = await getUsers()
      const parametersByUser = await getUserParameterValuesByUser()
      return users.map(
        (user) =>
          ({
            ...user,
            ssoUser: !!user.ssoUser,
            image: user.imageId ? `/api/images/${user.imageId}` : null,
            properties: parametersByUser[user.id] ?? {},
          }) as dto.User
      )
    },
  }),
  POST: operation({
    name: 'Create user',
    description: 'Create a new user.',
    authentication: 'admin',
    requestBodySchema: dto.insertableUserSchema,
    responseBodySchema: dto.userSchema,
    implementation: async (_req: Request, _params, { requestBody }) => {
      const { name, email, password, role, ssoUser } = requestBody
      const userInsert = {
        name,
        email,
        password: password ? await hashPassword(password) : null,
        role,
        ssoUser: ssoUser ? 1 : 0,
        preferences: '{}',
      }
      const createdUser = await createUserRaw(userInsert)
      return {
        ...createdUser,
        properties: {},
        ssoUser: !!createdUser.ssoUser,
        image: createdUser.imageId ? `/api/images/${createdUser.imageId}` : null,
      }
    },
  }),
})
