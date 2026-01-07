import { NextResponse } from 'next/server'
import ApiResponses from '@/api/utils/ApiResponses'
import { authenticate, type SimpleSession } from '@/api/utils/auth'
import { setRootSpanUser } from '@/lib/tracing/root-registry'
import * as dto from '@/types/dto'
import { z } from 'zod'
import { logger } from '@/lib/logging'

export type SchemaInput<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined

export type AuthLevel = 'admin' | 'user' | 'public'

export type RouteContext<
  TAuth extends AuthLevel,
  TSchema extends z.ZodTypeAny | undefined,
> = TAuth extends 'public'
  ? { requestBody: SchemaInput<TSchema> }
  : { session: SimpleSession; requestBody: SchemaInput<TSchema> }

export type ResponseSpec<
  TSchema extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
  TStatus extends number = number,
> = {
  status: TStatus
  schema?: TSchema
}

export type RouteDefinition<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined,
  TResponses extends readonly ResponseSpec[] | undefined = undefined,
  TAuth extends AuthLevel = 'public',
> = {
  name: string
  description?: string
  authentication: TAuth
  implementation: (
    req: Request,
    params: TParams,
    context: RouteContext<TAuth, TRequestSchema>
  ) => Promise<Response | OperationResult<TResponses>>
  requestBodySchema?: TRequestSchema
  responses?: TResponses
}

type VariantSchema = z.ZodDiscriminatedUnion<
  'status',
  Readonly<[z.AnyZodObject, ...z.AnyZodObject[]]>
>

type OperationResult<TResponses extends readonly ResponseSpec[] | undefined> =
  TResponses extends readonly ResponseSpec[] ? ResponseVariantFromSpecs<TResponses> : unknown

type ResponseVariantFromSpecs<T extends readonly ResponseSpec[] | undefined> =
  T extends readonly (infer Item)[]
    ? Item extends {
        status: infer S extends number
        schema?: infer Schema extends z.ZodTypeAny | undefined
      }
      ? Schema extends z.ZodTypeAny
        ? { status: S; body: z.infer<Schema> | Response }
        : { status: S; body?: unknown }
      : never
    : never

function buildVariantSchemaFromResponses(responses: readonly ResponseSpec[]): VariantSchema {
  const variants = responses.map((r) => {
    return z.object({
      status: z.literal(r.status),
      body: r.schema ?? z.any().optional(),
    })
  })

  return z.discriminatedUnion(
    'status',
    variants as unknown as [z.AnyZodObject, ...z.AnyZodObject[]]
  )
}

export function ok<TBody>(body: TBody): { status: 200; body: TBody }
export function ok<TBody, TStatus extends number>(
  body: TBody,
  status: TStatus
): { status: TStatus; body: TBody }
export function ok<TBody, TStatus extends number>(body: TBody, status: TStatus = 200 as TStatus) {
  return { status, body }
}

export function noBody(): { status: 204; body?: undefined }
export function noBody<TStatus extends number>(
  status: TStatus
): { status: TStatus; body?: undefined }
export function noBody<TStatus extends number>(status: TStatus = 204 as TStatus) {
  return { status }
}

export function error<TStatus extends number>(status: TStatus): { status: TStatus }
export function error<TStatus extends number, TBody>(
  status: TStatus,
  body: TBody
): { status: TStatus; body: TBody }
export function error<TStatus extends number>(
  status: TStatus,
  message: string,
  values?: object
): { status: TStatus; body: { error: { message: string; values: object } } }
export function error<TStatus extends number, TBody>(
  status: TStatus,
  bodyOrMessage?: TBody | string,
  values?: object
) {
  if (typeof bodyOrMessage === 'string') {
    return { status, body: { error: { message: bodyOrMessage, values: values ?? {} } } }
  }
  if (bodyOrMessage === undefined) {
    return { status }
  }
  return { status, body: bodyOrMessage }
}

export function responseSpec<TStatus extends number>(
  status: TStatus
): ResponseSpec<undefined, TStatus>
export function responseSpec<TSchema extends z.ZodTypeAny, TStatus extends number>(
  status: TStatus,
  schema: TSchema
): ResponseSpec<TSchema, TStatus>
export function responseSpec<TSchema extends z.ZodTypeAny | undefined, TStatus extends number>(
  status: TStatus,
  schema?: TSchema
): ResponseSpec<TSchema, TStatus> {
  return { status, schema }
}

export function notFound(message = 'Requested data is not available', values?: object) {
  return error(404, message, values)
}

export function forbidden(message = 'You are not authorized', values?: object) {
  return error(403, message, values)
}

export function conflict(message = "Can't create due to conflict", values?: object) {
  return error(409, message, values)
}

export type RouteHandlers<T extends Record<string, RouteDefinition<any, any, any, AuthLevel>>> = {
  [K in keyof T]: (
    req: Request,
    context: {
      params: T[K] extends RouteDefinition<infer P, any, any, AuthLevel> ? P | Promise<P> : any
    }
  ) => Promise<Response>
}

export function operation<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined = undefined,
  TResponses extends readonly ResponseSpec[] | undefined = undefined,
  TAuth extends AuthLevel = 'public',
>(def: RouteDefinition<TParams, TRequestSchema, TResponses, TAuth>) {
  return def
}

export function route<T extends Record<string, RouteDefinition<any, any, any, AuthLevel>>>(
  routes: T
): RouteHandlers<T> {
  const handlers = {} as RouteHandlers<T>

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

      const responses =
        config.responses && config.responses.length > 0 ? config.responses : undefined

      const variantSchema = responses ? buildVariantSchemaFromResponses(responses) : undefined

      if (variantSchema) {
        const parsedVariant = variantSchema.safeParse(result)
        if (!parsedVariant.success) {
          return ApiResponses.invalidParameter(
            'Invalid response variant',
            parsedVariant.error.format()
          )
        }
        const variant = parsedVariant.data as { status: number; body?: unknown }
        if (variant.body === undefined) {
          return new Response(null, { status: variant.status })
        }
        if (variant.body instanceof Response) {
          return variant.body
        }
        return NextResponse.json(variant.body, { status: variant.status })
      }

      return NextResponse.json(result)
    }

    const handler = async (req: Request, routeParams: { params: Params | Promise<Params> }) => {
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
        const message = e instanceof Error ? e.message : String(e)
        logger.error(`Unexpected exception: ${message}`, e)
        return ApiResponses.internalServerError()
      }
    }

    handlers[method] = handler as any
    ;(handlers[method] as any).__operation = config
  }

  ;(Object.keys(routes) as Array<keyof T>).forEach(makeHandler)

  return handlers as RouteHandlers<T>
}
