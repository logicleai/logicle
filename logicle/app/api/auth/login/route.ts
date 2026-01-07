// app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { addingSessionCookie } from '@/lib/auth/session'
import { getUserByEmail } from '@/models/user'
import { verifyPassword } from '@/lib/auth'
import { loginRequestSchema } from '@/types/dto/auth'
import { error, operation, responseSpec, route } from '@/lib/routes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Login',
    description: 'Authenticate with email and password.',
    authentication: 'public',
    requestBodySchema: loginRequestSchema,
    responses: [responseSpec(200), responseSpec(400), responseSpec(401)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      const body = requestBody
      const user = await getUserByEmail(body.email)
      if (!user) {
        return error(401, 'invalid-credentials')
      }
      if (!user.password) {
        return error(401, 'authentication method not supported for this user')
      }
      const hasValidPassword = await verifyPassword(body.password, user.password)
      if (!hasValidPassword) {
        return error(401, 'invalid-credentials')
      }
      return addingSessionCookie(NextResponse.json({ ok: true }), user)
    },
  }),
})
