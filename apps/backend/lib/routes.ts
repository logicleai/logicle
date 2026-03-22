import { authenticate } from '@/api/utils/auth'
import { type SimpleSession } from '@/types/session'
import { setRootSpanUser } from '@/lib/tracing/root-registry'
import * as dto from '@/types/dto'
import { z } from 'zod'
import { logger, sanitizeAndTransform } from '@/lib/logging'
import env from '@/lib/env'
import {
  applyResponseCookies,
  createMutableCookieStore,
  type MutableCookieStore,
} from '@/lib/http/cookies'

export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    values: z.record(z.string(), z.unknown()),
  }),
})

function makeErrorResponse(
  status: number,
  msg: string,
  values?: Record<string, unknown> | undefined
) {
  return Response.json(
    {
      error: {
        message: msg,
        values: values ?? {},
      },
    },
    { status: status }
  )
}

export type SchemaInput<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? z.infer<TSchema>
  : undefined

export type AuthLevel = 'admin' | 'user' | 'public'

type RawRequestBody = {
  json: () => Promise<unknown>
  formData: () => Promise<FormData>
  text: () => Promise<string>
  stream: ReadableStream<Uint8Array> | null
}

type BodyContext<TSchema extends z.ZodTypeAny | undefined> = TSchema extends z.ZodTypeAny
  ? {
      body: SchemaInput<TSchema>
    }
  : {
      request: RawRequestBody
    }

export type ImplementationContext<
  TParams extends Record<string, string>,
  TAuth extends AuthLevel,
  TSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
> = TAuth extends 'public'
  ? BodyContext<TSchema> & {
      params: TParams
      url: URL
      query: SchemaInput<TQuerySchema>
      headers: Headers
      signal: AbortSignal
      cookies: MutableCookieStore
    }
  : BodyContext<TSchema> & {
      params: TParams
      url: URL
      query: SchemaInput<TQuerySchema>
      headers: Headers
      signal: AbortSignal
      cookies: MutableCookieStore
      session: SimpleSession
    }

type ContextImplementation<
  TParams extends Record<string, string>,
  TAuth extends AuthLevel,
  TRequestSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TResponses extends readonly ResponseSpec[],
> = (
  context: ImplementationContext<TParams, TAuth, TRequestSchema, TQuerySchema>
) => Promise<Response | OperationResult<TResponses>>

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
  TQuerySchema extends z.ZodTypeAny | undefined,
  TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[],
  TAuth extends AuthLevel = 'public',
> = {
  name: string
  description?: string
  authentication: TAuth
  preventCrossSite?: boolean
  requestBodySchema?: TRequestSchema
  querySchema?: TQuerySchema
  responses: TResponses
  implementation: ContextImplementation<TParams, TAuth, TRequestSchema, TQuerySchema, TResponses>
}

type VariantSchema = z.ZodTypeAny

type OperationResult<TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[]> =
  ResponseVariantFromSpecs<TResponses>

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

  return z.discriminatedUnion('status', variants as any) as VariantSchema
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

export function error<TStatus extends number>(
  status: TStatus
): {
  status: TStatus
  body: { error: { message: string; values: Record<string, unknown> } }
}
export function error<TStatus extends number>(
  status: TStatus,
  message: string,
  values?: Record<string, unknown>
): {
  status: TStatus
  body: { error: { message: string; values: Record<string, unknown> } }
}
export function error<TStatus extends number, TBody>(
  status: TStatus,
  body: TBody
): { status: TStatus; body: TBody }
export function error<TStatus extends number, TBody>(
  status: TStatus,
  bodyOrMessage?: TBody | string,
  values?: Record<string, unknown>
) {
  if (typeof bodyOrMessage === 'string') {
    return { status, body: { error: { message: bodyOrMessage, values: values ?? {} } } }
  }
  if (bodyOrMessage === undefined) {
    return { status, body: { error: { message: '', values: {} } } }
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

export function errorSpec<TStatus extends number>(
  status: TStatus
): ResponseSpec<typeof errorResponseSchema, TStatus> {
  return { status, schema: errorResponseSchema }
}

export function notFound(
  message = 'Requested data is not available',
  values?: Record<string, unknown>
) {
  return error(404, message, values)
}

export function forbidden(message = 'You are not authorized', values?: Record<string, unknown>) {
  return error(403, message, values)
}

export function conflict(
  message = "Can't create due to conflict",
  values?: Record<string, unknown>
) {
  return error(409, message, values)
}


export type OperationHandler<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined,
  TQuerySchema extends z.ZodTypeAny | undefined,
  TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[],
  TAuth extends AuthLevel = 'public',
> = ((req: Request, context: { params: TParams | Promise<TParams> }) => Promise<Response>) & {
  __operation: RouteDefinition<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>
}

function searchParamsToObject(searchParams: URLSearchParams) {
  const result: Record<string, string | string[]> = {}

  searchParams.forEach((value, key) => {
    const current = result[key]
    if (current === undefined) {
      result[key] = value
      return
    }
    result[key] = Array.isArray(current) ? [...current, value] : [current, value]
  })

  return result
}

function createOperationHandler<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[],
  TAuth extends AuthLevel = 'public',
>(
  config: RouteDefinition<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>
): OperationHandler<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth> {
  const extractParams = async (routeParams: TParams | { params: TParams | Promise<TParams> }) => {
    if (routeParams && typeof routeParams === 'object' && 'params' in routeParams) {
      return (await routeParams.params) as TParams
    }
    return routeParams as TParams
  }

  const buildHandler = async (req: Request, params: TParams, session?: SimpleSession) => {
    let parsedBody = undefined as SchemaInput<TRequestSchema>
    let parsedQuery = undefined as SchemaInput<TQuerySchema>
    const url = new URL(req.url)
    const cookies = createMutableCookieStore(req.headers)
    const rawRequestBody: RawRequestBody = {
      json: () => req.json(),
      formData: () => req.formData(),
      text: () => req.text(),
      stream: (req.body as ReadableStream<Uint8Array> | null) ?? null,
    }

    if (config.querySchema) {
      const query = searchParamsToObject(url.searchParams)
      const result = config.querySchema.safeParse(query)
      if (!result.success) {
        return makeErrorResponse(400, 'Invalid query', result.error.format())
      }
      parsedQuery = result.data as SchemaInput<TQuerySchema>
    }

    if (config.requestBodySchema) {
      const body = await req.json()
      const result = config.requestBodySchema.safeParse(body)
      if (!result.success) {
        return makeErrorResponse(400, 'Invalid body', result.error.format())
      }
      parsedBody = result.data as SchemaInput<TRequestSchema>
    }

    let result: Response | OperationResult<TResponses>
    try {
      const context = {
        params,
        url,
        query: parsedQuery,
        headers: req.headers,
        signal: req.signal,
        cookies,
        ...(config.requestBodySchema ? { body: parsedBody } : { request: rawRequestBody }),
        ...(config.authentication !== 'public' ? { session: session! } : {}),
      } as unknown as ImplementationContext<TParams, TAuth, TRequestSchema, TQuerySchema>
      result = await config.implementation(context)
    } catch (error) {
      logger.error('Route implementation failed', {
        routeName: config.name,
        method: req.method,
        url: req.url,
        params,
        sessionUserId: session?.userId,
        query: sanitizeAndTransform(parsedQuery),
        body: sanitizeAndTransform(parsedBody),
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
              }
            : sanitizeAndTransform(error),
      })
      throw error
    }

    if (result instanceof Response) {
      return applyResponseCookies(result, cookies.modifications)
    }

    if (config.responses.length === 0) {
      logger.error(`Missing responses configuration for route ${config.name}`)
      return makeErrorResponse(500, 'Route responses not configured')
    }

    const variantSchema = buildVariantSchemaFromResponses(config.responses)
    const parsedVariant = variantSchema.safeParse(result)
    if (!parsedVariant.success) {
      return makeErrorResponse(400, 'Invalid response variant', parsedVariant.error.format())
    }

    const variant = parsedVariant.data as { status: number; body?: unknown }
    if (variant.body === undefined) {
      return applyResponseCookies(
        new Response(null, { status: variant.status }),
        cookies.modifications
      )
    }
    if (variant.body instanceof Response) {
      return applyResponseCookies(variant.body, cookies.modifications)
    }
    return applyResponseCookies(
      Response.json(variant.body, { status: variant.status }),
      cookies.modifications
    )
  }

  const handler = (async (req: Request, routeParams: { params: TParams | Promise<TParams> }) => {
    try {
      const params = await extractParams(routeParams)

      let session: SimpleSession | undefined
      if (
        config.preventCrossSite &&
        env.csrf.enableProtection &&
        req.headers.get('sec-fetch-site') !== 'same-origin'
      ) {
        return makeErrorResponse(401, 'csrf_protection')
      }
      if (config.authentication !== 'public') {
        const authResult = await authenticate(req)
        if (!authResult.success) {
          return makeErrorResponse(401, authResult.msg)
        }
        setRootSpanUser(authResult.value.userId)
        session = authResult.value

        if (config.authentication === 'admin' && session.userRole !== dto.UserRole.ADMIN) {
          return makeErrorResponse(403, 'Access limited to admios')
        }
      }

      return await buildHandler(req, params, session)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.error(`Unexpected exception: ${message}`, e)
      return makeErrorResponse(500, 'Internal server error')
    }
  }) as OperationHandler<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>

  handler.__operation = config
  return handler
}

export function operation<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[],
  TAuth extends AuthLevel = 'public',
>(
  def: RouteDefinition<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>
): OperationHandler<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>
export function operation<
  TParams extends Record<string, string>,
  TRequestSchema extends z.ZodTypeAny | undefined = undefined,
  TQuerySchema extends z.ZodTypeAny | undefined = undefined,
  TResponses extends readonly ResponseSpec[] = readonly ResponseSpec[],
  TAuth extends AuthLevel = 'public',
>(def: RouteDefinition<TParams, TRequestSchema, TQuerySchema, TResponses, TAuth>) {
  return createOperationHandler(def)
}

