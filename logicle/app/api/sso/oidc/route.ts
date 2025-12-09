import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { nanoid } from 'nanoid'
import { JacksonStore } from '@/db/schema'
import { OIDCSSORecord } from '@/lib/auth/saml'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a OIDC connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { name, description, discoveryUrl, clientId, clientSecret } = await req.json()

  const samlRecord: OIDCSSORecord = {
    oidcProvider: {
      discoveryUrl: discoveryUrl,
      clientId: clientId,
      clientSecret: clientSecret,
    },
    name: name,
    description: description,
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
