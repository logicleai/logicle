import { listIdpConnections } from '@/models/sso'
import { idpConnectionSchema } from '@/types/dto/sso'
import { operation, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

// Get the SAML connections.
export const { GET } = route({
  GET: operation({
    name: 'List SSO connections',
    description: 'Fetch all configured SSO connections.',
    authentication: 'admin',
    responseBodySchema: idpConnectionSchema.array(),
    implementation: async () => {
      return await listIdpConnections()
    },
  }),
})
