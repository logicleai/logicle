import { listIdpConnections } from '@/models/sso'
import { idpConnectionSchema } from '@/types/dto/sso'
import { ok, operation, responseSpec } from '@/lib/routes'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const GET = operation({
  name: 'List SSO connections',
  description: 'Fetch all configured SSO connections.',
  authentication: 'admin',
  responses: [responseSpec(200, idpConnectionSchema.array())] as const,
  implementation: async () => {
    return ok(await listIdpConnections())
  },
})
