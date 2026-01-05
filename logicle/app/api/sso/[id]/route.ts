import env from '@/lib/env'
import { requireAdmin, type SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'

export const dynamic = 'force-dynamic'

type RouteDefinition<TParams extends Record<string, string>> = {
  name: string
  description?: string
  authentication: 'admin' | 'public'
  implementation: (req: Request, params: TParams, session?: SimpleSession) => Promise<Response>
  requestBodySchema?: unknown
}

type TransformResult<T extends Record<string, RouteDefinition<any>>> = {
  handlers: {
    [K in keyof T]: (
      req: Request,
      params: Parameters<T[K]['implementation']>[1]
    ) => Promise<Response>
  }
  schema: T
}

function transform<T extends Record<string, RouteDefinition<any>>>(routes: T): TransformResult<T> {
  const handlers: Partial<TransformResult<T>['handlers']> = {}
  for (const [method, config] of Object.entries(routes) as [keyof T, RouteDefinition<any>][]) {
    handlers[method] =
      config.authentication === 'admin'
        ? requireAdmin(config.implementation)
        : config.implementation
  }
  return { handlers: handlers as TransformResult<T>['handlers'], schema: routes }
}

const transformed = transform({
  GET: {
    name: 'Get SSO connection',
    description: 'Fetch a specific SSO/SAML connection by id.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { id: string }) => {
      const connection = await findIdpConnection(params.id)
      if (!connection) {
        return ApiResponses.noSuchEntity()
      }
      return NextResponse.json(connection)
    },
  },
  DELETE: {
    name: 'Delete SSO connection',
    description: 'Remove an existing SSO/SAML connection.',
    authentication: 'admin',
    implementation: async (_req: Request, params: { id: string }) => {
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
  },
  PATCH: {
    name: 'Update SSO connection',
    description: 'Update mutable fields of an existing SSO/SAML connection.',
    authentication: 'admin',
    requestBodySchema: updateableSsoConnectionSchema,
    implementation: async (req: Request, params: { id: string }) => {
      if (env.sso.locked) {
        return ApiResponses.forbiddenAction('sso_locked')
      }
      const idp = await findIdpConnection(params.id)
      if (!idp) {
        return ApiResponses.noSuchEntity()
      }

      const result = updateableSsoConnectionSchema.safeParse(await req.json())
      if (!result.success) {
        return ApiResponses.invalidParameter('Invalid body', result.error.format())
      }
      await db.updateTable('IdpConnection').set(result.data).where('id', '=', params.id).execute()
      return ApiResponses.success()
    },
  },
})

export const { GET, DELETE, PATCH } = transformed.handlers
export const schema = transformed.schema
