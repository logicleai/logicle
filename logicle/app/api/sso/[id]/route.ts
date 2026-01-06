import env from '@/lib/env'
import { authenticate, type SimpleSession } from '@/api/utils/auth'
import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { deleteIdpConnection, findIdpConnection } from '@/models/sso'
import { updateableSsoConnectionSchema } from '@/types/dto/auth'
import { idpConnectionSchema } from '@/types/dto/sso'
import { setRootSpanUser } from '@/lib/tracing/root-registry'
import * as dto from '@/types/dto'
import { defaultErrorResponse, interpretDbException } from '@/db/exception'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type SchemaInput<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined

type AuthLevel = 'admin' | 'user' | 'public'

type RouteContext<
  TAuth extends AuthLevel,
  TSchema extends z.ZodTypeAny | undefined,
> = TAuth extends 'public'
  ? { requestBody: SchemaInput<TSchema> }
  : { session: SimpleSession; requestBody: SchemaInput<TSchema> }

type RouteDefinition<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined,
  TResponseSchema extends z.ZodTypeAny | undefined = undefined,
  TAuth extends AuthLevel = 'public',
> = {
  name: string
  description?: string
  authentication: TAuth
  implementation: (
    req: Request,
    params: TParams,
    context: RouteContext<TAuth, TRequestSchema>
  ) => Promise<Response | ResponseBody<TResponseSchema>>
  requestBodySchema?: TRequestSchema
  responseBodySchema?: TResponseSchema
}

type ResponseBody<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : unknown

type TransformResult<T extends Record<string, RouteDefinition<any, any, any, AuthLevel>>> = {
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
  TAuth extends AuthLevel = 'public',
>(def: RouteDefinition<TParams, TRequestSchema, TResponseSchema, TAuth>) {
  return def
}

function transform<T extends Record<string, RouteDefinition<any, any, any, AuthLevel>>>(
  routes: T
): TransformResult<T> {
  const handlers = {} as TransformResult<T>['handlers']

  const makeHandler = <K extends keyof T>(method: K) => {
    const config = routes[method]

    type Params = T[K] extends RouteDefinition<infer P, any, any, AuthLevel>
      ? P
      : Record<string, string>

    const extractParams = async (routeParams: Params | { params: Params | Promise<Params> }) => {
      if (routeParams && typeof routeParams === 'object' && 'params' in routeParams) {
        return (await (routeParams as any).params) as Params
      }
      return routeParams as Params
    }

    const buildHandler = async (req: Request, params: Params, session?: SimpleSession) => {
      let parsedBody = undefined as SchemaInput<T[K]['requestBodySchema']>

      if (config.requestBodySchema) {
        const body = await req.json()
        const result = config.requestBodySchema.safeParse(body)
        if (!result.success) {
          return ApiResponses.invalidParameter('Invalid body', result.error.format())
        }
        parsedBody = result.data as SchemaInput<T[K]['requestBodySchema']>
      }

      const context =
        config.authentication === 'public'
          ? ({ requestBody: parsedBody } as RouteContext<'public', T[K]['requestBodySchema']>)
          : ({ session: session!, requestBody: parsedBody } as RouteContext<
              Exclude<AuthLevel, 'public'>,
              T[K]['requestBodySchema']
            >)

      const result = await config.implementation(req, params, context)

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

    const handler = async (
      req: Request,
      routeParams: Params | { params: Params | Promise<Params> }
    ) => {
      try {
        const params = await extractParams(routeParams)

        let session: SimpleSession | undefined
        if (config.authentication !== 'public') {
          const authResult = await authenticate(req)
          if (!authResult.success) {
            return authResult.error
          }
          setRootSpanUser(authResult.value.userId)
          session = authResult.value
          if (config.authentication === 'admin' && session.userRole !== dto.UserRole.ADMIN) {
            return ApiResponses.forbiddenAction()
          }
        }

        return await buildHandler(req, params, session)
      } catch (e) {
        return defaultErrorResponse(interpretDbException(e))
      }
    }

    handlers[method] = handler as any
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
