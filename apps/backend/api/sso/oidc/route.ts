import { db } from '@/db/database'
import env from '@/lib/env'
import { forbidden, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const POST = operation({
  name: 'Create OIDC SSO connection',
  description: 'Create a new OIDC identity provider connection.',
  authentication: 'admin',
  requestBodySchema: dto.insertableOidcConnectionSchema,
  responses: [responseSpec(200, z.object({})), errorSpec(403)] as const,
  implementation: async ({ body }) => {
    if (env.sso.locked) {
      return forbidden('sso_locked')
    }

    const { name, description, discoveryUrl, clientId, clientSecret } = body

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
})
