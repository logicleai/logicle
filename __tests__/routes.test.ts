import { beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import {
  conflict,
  error,
  errorSpec,
  forbidden,
  noBody,
  notFound,
  ok,
  operation,
  responseSpec,
  route,
} from '@/lib/routes'
import { authenticate } from '@/api/utils/auth'
import {
  applyResponseCookies,
  createMutableCookieStore,
  getCookieValue,
  parseCookieHeader,
  serializeCookie,
} from '@/lib/http/cookies'

vi.mock('@/api/utils/auth', () => ({
  authenticate: vi.fn(),
}))

vi.mock('@/lib/tracing/root-registry', () => ({
  setRootSpanUser: vi.fn(),
}))

const mockedAuthenticate = vi.mocked(authenticate)

describe('operation route layer', () => {
  beforeEach(() => {
    mockedAuthenticate.mockReset()
  })

  test('provides parsed body and query to the implementation context', async () => {
    const handler = operation({
      name: 'Create thing',
      authentication: 'public' as const,
      requestBodySchema: z.object({
        name: z.string(),
      }),
      querySchema: z.object({
        page: z.coerce.number(),
      }),
      responses: [
        responseSpec(
          200,
          z.object({
            name: z.string(),
            page: z.number(),
          })
        ),
      ] as const,
      implementation: async ({ body, query, params }) => {
        expect(params.id).toBe('thing-1')
        return ok({
          name: body.name,
          page: query.page,
        })
      },
    })

    const response = await handler(
      new Request('http://localhost/api/things/thing-1?page=2', {
        method: 'POST',
        body: JSON.stringify({ name: 'Ada' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: 'thing-1' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ name: 'Ada', page: 2 })
  })

  test('collects repeated query parameters into arrays', async () => {
    const handler = operation({
      name: 'List tags',
      authentication: 'public' as const,
      querySchema: z.object({
        tag: z.array(z.string()),
      }),
      responses: [
        responseSpec(
          200,
          z.object({
            tags: z.array(z.string()),
          })
        ),
      ] as const,
      implementation: async ({ query }) => ok({ tags: query.tag }),
    })

    const response = await handler(
      new Request('http://localhost/tags?tag=alpha&tag=beta&tag=gamma'),
      {
        params: Promise.resolve({}),
      }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ tags: ['alpha', 'beta', 'gamma'] })
  })

  test('returns 400 for invalid query parameters', async () => {
    const handler = operation({
      name: 'List things',
      authentication: 'public' as const,
      querySchema: z.object({
        page: z.coerce.number(),
      }),
      responses: [responseSpec(204)] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(new Request('http://localhost/api/things?page=abc'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'Invalid query',
      },
    })
  })

  test('returns 400 for invalid request bodies', async () => {
    const handler = operation({
      name: 'Create thing',
      authentication: 'public' as const,
      requestBodySchema: z.object({
        name: z.string(),
      }),
      responses: [responseSpec(204)] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(
      new Request('http://localhost/api/things', {
        method: 'POST',
        body: JSON.stringify({ name: 42 }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: 'Invalid body',
      },
    })
  })

  test('provides authenticated session in the implementation context', async () => {
    mockedAuthenticate.mockResolvedValue({
      success: true,
      value: {
        sessionId: 'session-1',
        userId: 'user-1',
        userRole: 'ADMIN',
      },
    })

    const handler = operation({
      name: 'Admin route',
      authentication: 'admin' as const,
      responses: [
        responseSpec(
          200,
          z.object({
            userId: z.string(),
            sessionId: z.string(),
          })
        ),
        errorSpec(403),
      ] as const,
      implementation: async ({ session }) => {
        return ok({
          userId: session.userId,
          sessionId: session.sessionId,
        })
      },
    })

    const response = await handler(new Request('http://localhost/api/admin'), {
      params: Promise.resolve({}),
    })

    expect(mockedAuthenticate).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    })
  })

  test('supports direct params objects and authenticated body parsing together', async () => {
    mockedAuthenticate.mockResolvedValue({
      success: true,
      value: {
        sessionId: 'session-3',
        userId: 'user-3',
        userRole: 'USER',
      },
    })

    const handler = operation({
      name: 'Update profile',
      authentication: 'user' as const,
      requestBodySchema: z.object({
        displayName: z.string(),
      }),
      responses: [
        responseSpec(
          200,
          z.object({
            id: z.string(),
            displayName: z.string(),
            userId: z.string(),
          })
        ),
      ] as const,
      implementation: async ({ body, params, session }) => {
        return ok({
          id: params.id,
          displayName: body.displayName,
          userId: session.userId,
        })
      },
    })

    const response = await handler(
      new Request('http://localhost/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Ada Lovelace' }),
        headers: { 'content-type': 'application/json' },
      }),
      { id: 'profile-1' } as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'profile-1',
      displayName: 'Ada Lovelace',
      userId: 'user-3',
    })
  })

  test('flushes cookie mutations from the route context onto the response', async () => {
    const handler = operation({
      name: 'Cookie route',
      authentication: 'public' as const,
      responses: [
        responseSpec(
          200,
          z.object({
            theme: z.string(),
            session: z.string(),
          })
        ),
      ] as const,
      implementation: async ({ cookies }) => {
        expect(cookies.currentState.get('theme')).toBe('dark')
        expect(cookies.get('session')?.value).toBe('old-session')

        cookies.set('session', 'new-session', {
          httpOnly: true,
          path: '/',
        })

        return ok({
          theme: cookies.get('theme')!.value,
          session: cookies.get('session')!.value,
        })
      },
    })

    const response = await handler(
      new Request('http://localhost/api/cookies', {
        headers: {
          cookie: 'theme=dark; session=old-session',
        },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('session=new-session')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    await expect(response.json()).resolves.toEqual({
      theme: 'dark',
      session: 'new-session',
    })
  })

  test('also flushes cookie mutations when implementation returns a raw Response', async () => {
    const handler = operation({
      name: 'Redirect with cookie',
      authentication: 'public' as const,
      responses: [responseSpec(302)] as const,
      implementation: async ({ cookies }) => {
        cookies.delete('session')
        return Response.redirect('http://localhost/login', 302)
      },
    })

    const response = await handler(
      new Request('http://localhost/api/logout', {
        headers: {
          cookie: 'session=abc',
        },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost/login')
    expect(response.headers.get('set-cookie')).toContain('session=')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  test('provides raw request helpers when no request body schema is declared', async () => {
    const handler = operation({
      name: 'Form route',
      authentication: 'public' as const,
      responses: [
        responseSpec(
          200,
          z.object({
            text: z.string(),
            formValue: z.string(),
            streamExists: z.boolean(),
          })
        ),
      ] as const,
      implementation: async ({ request }) => {
        const text = await request.text()
        const formData = await new Request('http://localhost/form', {
          method: 'POST',
          body: text,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }).formData()

        return ok({
          text,
          formValue: String(formData.get('name')),
          streamExists: request.stream !== null,
        })
      },
    })

    const response = await handler(
      new Request('http://localhost/form', {
        method: 'POST',
        body: 'name=Ada',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      text: 'name=Ada',
      formValue: 'Ada',
      streamExists: true,
    })
  })

  test('rejects cross-site requests when csrf protection is enabled', async () => {
    const handler = operation({
      name: 'Protected route',
      authentication: 'public' as const,
      preventCrossSite: true,
      responses: [responseSpec(204)] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(
      new Request('http://localhost/protected', {
        headers: { 'sec-fetch-site': 'cross-site' },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'csrf_protection' },
    })
  })

  test('returns 401 when authentication fails', async () => {
    mockedAuthenticate.mockResolvedValue({
      success: false,
      msg: 'Not authenticated',
    })

    const handler = operation({
      name: 'User route',
      authentication: 'user' as const,
      responses: [responseSpec(204)] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(new Request('http://localhost/user'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Not authenticated' },
    })
  })

  test('returns 403 when a non-admin user accesses an admin route', async () => {
    mockedAuthenticate.mockResolvedValue({
      success: true,
      value: {
        sessionId: 'session-2',
        userId: 'user-2',
        userRole: 'USER',
      },
    })

    const handler = operation({
      name: 'Admin only',
      authentication: 'admin' as const,
      responses: [responseSpec(204), errorSpec(403)] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(new Request('http://localhost/admin'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Access limited to admios' },
    })
  })

  test('returns 400 when implementation produces a response variant not declared in responses', async () => {
    const handler = operation({
      name: 'Invalid variant',
      authentication: 'public' as const,
      responses: [responseSpec(200, z.object({ ok: z.boolean() }))] as const,
      implementation: async () => ({ status: 201 as 201, body: { ok: true } }),
    })

    const response = await handler(new Request('http://localhost/invalid-variant'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Invalid response variant' },
    })
  })

  test('returns 500 when an operation declares no responses', async () => {
    const handler = operation({
      name: 'No responses',
      authentication: 'public' as const,
      responses: [] as const,
      implementation: async () => noBody(),
    })

    const response = await handler(new Request('http://localhost/no-responses'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Route responses not configured' },
    })
  })

  test('returns 500 when implementation throws', async () => {
    const handler = operation({
      name: 'Throwing route',
      authentication: 'public' as const,
      responses: [responseSpec(204)] as const,
      implementation: async () => {
        throw new Error('boom')
      },
    })

    const response = await handler(new Request('http://localhost/throws'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Internal server error' },
    })
  })

  test('returns 500 when implementation throws a non-Error value', async () => {
    const handler = operation({
      name: 'Throwing route',
      authentication: 'public' as const,
      responses: [responseSpec(204)] as const,
      implementation: async () => {
        throw 'boom'
      },
    })

    const response = await handler(new Request('http://localhost/throws-string'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Internal server error' },
    })
  })

  test('returns 500 when an authenticated implementation throws', async () => {
    mockedAuthenticate.mockResolvedValue({
      success: true,
      value: {
        sessionId: 'session-4',
        userId: 'user-4',
        userRole: 'USER',
      },
    })

    const handler = operation({
      name: 'Authenticated throw',
      authentication: 'user' as const,
      responses: [responseSpec(204)] as const,
      implementation: async () => {
        throw new Error('auth boom')
      },
    })

    const response = await handler(new Request('http://localhost/auth-throws'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Internal server error' },
    })
  })

  test('supports response variants whose body is already a Response', async () => {
    const handler = operation({
      name: 'Nested response',
      authentication: 'public' as const,
      responses: [responseSpec(200, z.any())] as const,
      implementation: async ({ cookies }) => {
        cookies.set('mode', 'passthrough', { sameSite: 'lax' })
        return {
          status: 200 as const,
          body: new Response('plain text', {
            headers: { 'content-type': 'text/plain' },
          }),
        }
      },
    })

    const response = await handler(new Request('http://localhost/nested-response'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('plain text')
    expect(response.headers.get('set-cookie')).toContain('mode=passthrough')
  })

  test('route(...) wraps method handlers', async () => {
    const handlers = route({
      GET: {
        name: 'Wrapped get',
        authentication: 'public' as const,
        responses: [responseSpec(204)] as const,
        implementation: async () => noBody(),
      },
    })

    const response = await handlers.GET(new Request('http://localhost/wrapped'), {
      params: Promise.resolve({}),
    })

    expect(response.status).toBe(204)
  })
})

describe('route helper exports', () => {
  test('error helpers build the expected payloads', () => {
    expect(error(418)).toEqual({
      status: 418,
      body: { error: { message: '', values: {} } },
    })
    expect(error(422, 'bad', { field: 'name' })).toEqual({
      status: 422,
      body: { error: { message: 'bad', values: { field: 'name' } } },
    })
    expect(error(409, { custom: true })).toEqual({
      status: 409,
      body: { custom: true },
    })
    expect(notFound('missing')).toEqual({
      status: 404,
      body: { error: { message: 'missing', values: {} } },
    })
    expect(forbidden('nope')).toEqual({
      status: 403,
      body: { error: { message: 'nope', values: {} } },
    })
    expect(conflict('conflict')).toEqual({
      status: 409,
      body: { error: { message: 'conflict', values: {} } },
    })
    expect(noBody(205)).toEqual({ status: 205 })
    expect(ok({ done: true }, 201)).toEqual({ status: 201, body: { done: true } })
    expect(responseSpec(204)).toEqual({ status: 204, schema: undefined })
  })
})

describe('cookie helpers', () => {
  test('parseCookieHeader handles malformed and encoded values', () => {
    const parsed = parseCookieHeader('theme=dark; invalid; =oops; name=Jane%20Doe')
    expect(parsed.get('theme')).toBe('dark')
    expect(parsed.get('name')).toBe('Jane Doe')
    expect(parsed.has('')).toBe(false)
  })

  test('serializeCookie emits all supported attributes', () => {
    const serialized = serializeCookie('session', 'abc', {
      path: '/',
      expires: new Date(0),
      maxAge: 5,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    })

    expect(serialized).toContain('session=abc')
    expect(serialized).toContain('Path=/')
    expect(serialized).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(serialized).toContain('Max-Age=5')
    expect(serialized).toContain('HttpOnly')
    expect(serialized).toContain('Secure')
    expect(serialized).toContain('SameSite=none')
  })

  test('createMutableCookieStore exposes current state and modifications', () => {
    const cookies = createMutableCookieStore(
      new Headers({
        cookie: 'theme=dark',
      })
    )

    expect(cookies.get('missing')).toBeUndefined()
    cookies.set('theme', 'light', { secure: true })
    cookies.delete('theme')

    expect(cookies.currentState.get('theme')).toBeUndefined()
    expect(cookies.modifications).toHaveLength(2)
    expect(cookies.modifications[0]).toMatchObject({
      name: 'theme',
      value: 'light',
    })
    expect(cookies.modifications[1]).toMatchObject({
      name: 'theme',
      value: '',
    })
  })

  test('getCookieValue and applyResponseCookies handle empty and populated cases', () => {
    const headers = new Headers({
      cookie: 'token=abc',
    })

    expect(getCookieValue(headers, 'token')).toBe('abc')
    expect(getCookieValue(headers, 'missing')).toBeUndefined()

    const response = new Response('ok')
    expect(applyResponseCookies(response, [])).toBe(response)

    const updated = applyResponseCookies(response, [
      {
        name: 'token',
        value: 'def',
        options: { sameSite: 'strict' },
      },
    ])

    expect(updated).not.toBe(response)
    expect(updated.headers.get('set-cookie')).toContain('token=def')
    expect(updated.headers.get('set-cookie')).toContain('SameSite=strict')
  })
})
