// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { removingSessionCookie } from '@/lib/auth/session'
import { operation, responseSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Logout',
    description: 'Clear the session cookie.',
    authentication: 'public',
    responses: [responseSpec(200)] as const,
    implementation: async () => {
      return removingSessionCookie(NextResponse.json({ ok: true }))
    },
  }),
})
