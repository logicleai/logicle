import { db } from '@/db/database'
import env from '@/lib/env'
import { error, forbidden, ok, operation, responseSpec, route } from '@/lib/routes'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Create OIDC SSO connection',
    description: 'Create a new OIDC identity provider connection.',
    authentication: 'admin',
    requestBodySchema: dto.insertableOidcConnectionSchema,
    responses: [responseSpec(200), responseSpec(403)] as const,
    implementation: async (_req: Request, _params, { requestBody }) => {
      if (env.sso.locked) {
        return forbidden('sso_locked')
      }

      const { name, description, discoveryUrl, clientId, clientSecret } = requestBody

      const config: dto.OIDCConfig = {
        discoveryUrl,
        clientId,
        clientSecret,
      }

      await db
        .insertInto('IdpConnection')
        .values({
          id: nanoid(),
          name,
          description,
          type: 'OIDC' as const,
          config: JSON.stringify(config),
        })
        .execute()

      return ok({})
    },
  }),
})
