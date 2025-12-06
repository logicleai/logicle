import env from '@/lib/env'
import jackson from '@/lib/jackson'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { nanoid } from 'nanoid'
import { JacksonStore } from '@/db/schema'
import { OIDCSSORecord } from '@boxyhq/saml-jackson'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a OIDC connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { apiController } = await jackson()
  const { name, description, discoveryUrl, clientId, clientSecret } = await req.json()

  const clientID = nanoid()
  const samlRecord: OIDCSSORecord = {
    clientID: clientID,
    clientSecret: nanoid(),
    oidcProvider: {
      provider: name,
      friendlyProviderName: description,
      discoveryUrl: discoveryUrl,
      clientId: clientID,
      clientSecret: clientSecret,
    },
    defaultRedirectUrl: env.oidc.redirectUrl,
    redirectUrl: env.oidc.redirectUrl,
    tenant: tenant,
    product: 'logicle',
  }
  db.insertInto('JacksonStore')
    .values({
      key: nanoid(),
      value: JSON.stringify(samlRecord),
      iv: null,
      tag: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      namespace: 'saml:config',
    } satisfies JacksonStore)
    .execute()
  return ApiResponses.json({})
})
