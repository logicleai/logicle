// app/api/auth/logout/route.ts
import { removingSessionCookie } from '@/lib/auth/session'
import { operation, responseSpec, route, noBody } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Logout',
    description: 'Clear the session cookie.',
    authentication: 'public',
    preventCrossSite: true,
    responses: [responseSpec(204)] as const,
    implementation: async () => {
      await removingSessionCookie()
      return noBody()
    },
  }),
})
