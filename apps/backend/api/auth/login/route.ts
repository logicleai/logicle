// app/api/auth/login/route.ts
import { addSessionCookie } from '@/lib/auth/session'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '@/lib/auth/password'
import { loginRequestSchema } from '@/types/dto/auth'
import { ok, error, operation, responseSpec, errorSpec, noBody } from '@/lib/routes'
import { getLoginPageConfig } from '@/lib/app-config'
import { publicIdpConnectionSchema } from '@/types/dto/sso'
import env from '@/lib/env'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public config the login page needs before the user has authenticated.
// Signup is force-enabled when there are no users yet, so the first admin
// account can always be created.
export const GET = operation({
  name: 'Get login page config',
  description: 'Public config (identity providers, signup availability) for the login page.',
  authentication: 'public',
  responses: [
    responseSpec(
      200,
      z.object({
        identityProviders: publicIdpConnectionSchema.array(),
        enableSignup: z.boolean(),
      })
    ),
  ] as const,
  implementation: async () => {
    const { userCount, identityProviders } = await getLoginPageConfig()
    return ok({
      identityProviders,
      enableSignup: env.signup.enable || userCount === 0,
    })
  },
})

export const POST = operation({
  name: 'Login',
  description: 'Authenticate with email and password.',
  authentication: 'public',
  preventCrossSite: true,
  requestBodySchema: loginRequestSchema,
  responses: [responseSpec(204), errorSpec(400), errorSpec(401), errorSpec(403)] as const,
  implementation: async ({ headers, cookies, body }) => {
    const user = await getUserByEmail(body.email)
    if (!user) {
      return error(401, 'invalid-credentials')
    }
    if (!user.password) {
      return error(401, 'authentication method not supported for this user')
    }
    if (!user.enabled) {
      return error(403, 'user-disabled')
    }
    const hasValidPassword = await verifyPassword(body.password, user.password)
    if (!hasValidPassword) {
      return error(401, 'invalid-credentials')
    }
    await addSessionCookie(user, cookies, undefined, { headers })
    return noBody()
  },
})
