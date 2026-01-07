import { createUser, getUserByEmail, getUserCount } from '@/models/user'
import { PropertySource } from '@/lib/properties'
import env from '@/lib/env'
import { joinRequestSchema } from '@/types/dto/auth'
import { error, ok, operation, responseSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Signup',
    description: 'Create a new user account.',
    authentication: 'public',
    requestBodySchema: joinRequestSchema,
    responses: [responseSpec(201), responseSpec(400)] as const,
    implementation: async (_req: Request, _params, { requestBody: joinRequest }) => {
      const existingUser = await getUserByEmail(joinRequest.email)

      if (existingUser) {
        return error(400, 'An user with this email already exists.')
      }

      const userCount = await getUserCount()

      const isSignupEnabled = env.signup.enable && (await PropertySource.signupEnabled())

      if (userCount !== 0 && !isSignupEnabled) {
        return error(400, 'Signup is not enabled')
      }

      const user = await createUser({
        name: joinRequest.name,
        email: joinRequest.email,
        password: joinRequest.password,
        is_admin: userCount === 0,
        ssoUser: 0,
      })

      return ok(user, 201)
    },
  }),
})
