import env from '@/lib/env'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

// there is no tenant...
const tenant = 'app'

// Create a OIDC connection.
export const POST = requireAdmin(async (req: Request) => {
  if (env.sso.locked) {
    return ApiResponses.forbiddenAction('sso_locked')
  }
  const { name, description, discoveryUrl, clientId, clientSecret } = await req.json()

  const config: dto.OIDCConfig = {
    discoveryUrl: discoveryUrl,
    clientId: clientId,
    clientSecret: clientSecret,
  }

  db.insertInto('IdpConnection')
    .values({
      id: nanoid(),
      name,
      description,
      type: 'OIDC' as const,
      config: JSON.stringify(config),
    })
    .execute()
  return ApiResponses.json({})
})
