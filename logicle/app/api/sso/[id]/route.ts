import env from '@/lib/env'
import { requireAdmin, type SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type SchemaInput<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined

type RouteContext<TSchema extends z.ZodTypeAny | undefined> = {
  session?: SimpleSession
  input: { schema: SchemaInput<TSchema> }
}

type RouteDefinition<
  TParams extends Record<string, string>,
  TSchema extends z.ZodTypeAny | undefined
> = {
  name: string
  description?: string
  authentication: 'admin' | 'public'
  implementation: (
    req: Request,
    params: TParams,
    context?: RouteContext<TSchema>
  ) => Promise<Response>
  requestBodySchema?: TSchema
}

type TransformResult<T extends Record<string, RouteDefinition<any, any>>> = {
  handlers: {
    [K in keyof T]: (
      req: Request,
      params: T[K] extends RouteDefinition<infer P, any> ? P : never
    ) => Promise<Response>
  }
  schema: T
}

function transform<T extends Record<string, RouteDefinition<any, any>>>(routes: T): TransformResult<T> {
  const handlers: Partial<TransformResult<T>['handlers']> = {}
  for (const [method, config] of Object.entries(routes) as [keyof T, RouteDefinition<any, any>][]) {
    const buildHandler = async (
      req: Request,
      params: Parameters<RouteDefinition<any, any>['implementation']>[1],
      session?: SimpleSession
    ) => {
      let parsedBody: unknown = undefined
      if (config.requestBodySchema) {
        const body = await req.json()
        const result = config.requestBodySchema.safeParse(body)
        if (!result.success) {
          return ApiResponses.invalidParameter('Invalid body', result.error.format())
        }
        parsedBody = result.data
      }
      return config.implementation(req, params, {
        session,
        input: { schema: parsedBody as SchemaInput<typeof config.requestBodySchema> },
      })
    }

    handlers[method] =
      config.authentication === 'admin'
        ? requireAdmin(buildHandler as any)
        : (buildHandler as any)
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
    implementation: async (
      _req: Request,
      params: { id: string },
      { input } = { input: { schema: undefined } }
    ) => {
      if (env.sso.locked) {
        return ApiResponses.forbiddenAction('sso_locked')
      }
      const idp = await findIdpConnection(params.id)
      if (!idp) {
        return ApiResponses.noSuchEntity()
      }

      await db.updateTable('IdpConnection').set(input.schema).where('id', '=', params.id).execute()
      return ApiResponses.success()
    },
  },
})

export const { GET, DELETE, PATCH } = transformed.handlers
export const schema = transformed.schema
