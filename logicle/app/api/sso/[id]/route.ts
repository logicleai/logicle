import env from '@/lib/env'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'
import { idpConnectionSchema } from '@/types/dto/sso'
import { operation, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, DELETE, PATCH } = route({
  GET: operation({
    name: 'Get SSO connection',
    description: 'Fetch a specific SSO/SAML connection by id.',
    authentication: 'admin',
    responseBodySchema: idpConnectionSchema,
    implementation: async (_req: Request, params: { id: string }, _ctx) => {
      const connection = await findIdpConnection(params.id)
      if (!connection) {
        return ApiResponses.noSuchEntity()
      }
      return connection
    },
  }),
  DELETE: operation({
    name: 'Delete SSO connection',
    description: 'Remove an existing SSO/SAML connection.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { id: string }, _ctx) => {
      if (env.sso.locked) {
        return ApiResponses.forbiddenAction('sso_locked')
      }
      const identityProvider = await findIdpConnection(params.id)
      if (!identityProvider) {
        return ApiResponses.noSuchEntity()
      }
      await deleteIdpConnection(params.id)
      return ApiResponses.success()
    },
  }),
  PATCH: operation({
    name: 'Update SSO connection',
    description: 'Update mutable fields of an existing SSO/SAML connection.',
    authentication: 'admin',
    requestBodySchema: updateableSsoConnectionSchema,
    implementation: async (_req: Request, params: { id: string }, { requestBody }) => {
      if (env.sso.locked) {
        return ApiResponses.forbiddenAction('sso_locked')
      }
      const idp = await findIdpConnection(params.id)
      if (!idp) {
        return ApiResponses.noSuchEntity()
      }

      await db.updateTable('IdpConnection').set(requestBody).where('id', '=', params.id).execute()
      return ApiResponses.success()
    },
  }),
})
