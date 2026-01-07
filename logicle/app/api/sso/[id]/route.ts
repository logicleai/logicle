import env from '@/lib/env'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'
import { idpConnectionSchema } from '@/types/dto/sso'
import { forbidden, noBody, notFound, ok, operation, responseSpec, route } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, DELETE, PATCH } = route({
  GET: operation({
    name: 'Get SSO connection',
    description: 'Fetch a specific SSO/SAML connection by id.',
    authentication: 'admin',
    responses: [responseSpec(200, idpConnectionSchema), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { id: string }, _ctx) => {
      const connection = await findIdpConnection(params.id)
      if (!connection) {
        return notFound()
      }
      return ok(connection)
    },
  }),
  DELETE: operation({
    name: 'Delete SSO connection',
    description: 'Remove an existing SSO/SAML connection.',
    authentication: 'admin',
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { id: string }, _ctx) => {
      if (env.sso.locked) {
        return forbidden('sso_locked')
      }
      const identityProvider = await findIdpConnection(params.id)
      if (!identityProvider) {
        return notFound()
      }
      await deleteIdpConnection(params.id)
      return noBody()
    },
  }),
  PATCH: operation({
    name: 'Update SSO connection',
    description: 'Update mutable fields of an existing SSO/SAML connection.',
    authentication: 'admin',
    requestBodySchema: updateableSsoConnectionSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { id: string }, { requestBody }) => {
      if (env.sso.locked) {
        return forbidden('sso_locked')
      }
      const idp = await findIdpConnection(params.id)
      if (!idp) {
        return notFound()
      }

      await db.updateTable('IdpConnection').set(requestBody).where('id', '=', params.id).execute()
      return noBody()
    },
  }),
})
