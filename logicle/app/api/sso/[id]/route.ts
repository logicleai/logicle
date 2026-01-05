import env from '@/lib/env'
import { requireAdmin, type SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'
import { idpConnectionSchema } from '@/types/dto/sso'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type SchemaInput<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined

type RouteContext<TSchema extends z.ZodTypeAny | undefined> = {
  session?: SimpleSession
  requestBody: SchemaInput<TSchema>
}

type RouteDefinition<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined,
  TResponseSchema extends z.ZodTypeAny | undefined = undefined,
> = {
  name: string
  description?: string
  authentication: 'admin' | 'public'
  implementation: (
    req: Request,
    params: TParams,
    context: RouteContext<TRequestSchema>
  ) => Promise<Response | ResponseBody<TResponseSchema>>
  requestBodySchema?: TRequestSchema
  responseBodySchema?: TResponseSchema
}

type ResponseBody<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : unknown

type TransformResult<T extends Record<string, RouteDefinition<any, any, any>>> = {
  handlers: {
    [K in keyof T]: (
      req: Request,
      params: T[K] extends RouteDefinition<infer P, any, any> ? P : never
    ) => Promise<Response>
  }
  schema: T
}

function defineRoute<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined = undefined,
  TResponseSchema extends z.ZodTypeAny | undefined = undefined,
>(def: RouteDefinition<TParams, TRequestSchema, TResponseSchema>) {
  return def
}

function transform<T extends Record<string, RouteDefinition<any, any, any>>>(
  routes: T
): TransformResult<T> {
  const handlers = {} as TransformResult<T>['handlers']

  const makeHandler = <K extends keyof T>(method: K) => {
    const config = routes[method]

    const buildHandler = async (
      req: Request,
      params: T[K] extends RouteDefinition<infer P, any, any> ? P : never,
      session?: SimpleSession
    ) => {
      let parsedBody = undefined as SchemaInput<T[K]['requestBodySchema']>

      if (config.requestBodySchema) {
        const body = await req.json()
        const result = config.requestBodySchema.safeParse(body)
        if (!result.success) {
          return ApiResponses.invalidParameter('Invalid body', result.error.format())
        }
        parsedBody = result.data as SchemaInput<T[K]['requestBodySchema']>
      }

      const result = await config.implementation(req, params, {
        session,
        requestBody: parsedBody,
      })

      if (result instanceof Response) {
        return result
      }

      if (config.responseBodySchema) {
        const parsedResponse = config.responseBodySchema.safeParse(result)
        if (!parsedResponse.success) {
          return ApiResponses.invalidParameter(
            'Invalid response body',
            parsedResponse.error.format()
          )
        }
        return NextResponse.json(parsedResponse.data)
      }

      return NextResponse.json(result)
    }

    handlers[method] =
      config.authentication === 'admin'
        ? (requireAdmin(buildHandler as any) as any)
        : (buildHandler as any)
  }

  ;(Object.keys(routes) as Array<keyof T>).forEach(makeHandler)

  return { handlers, schema: routes }
}

const transformed = transform({
  GET: defineRoute({
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
  DELETE: defineRoute({
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
  PATCH: defineRoute({
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

export const { GET, DELETE, PATCH } = transformed.handlers
export const schema = transformed.schema
