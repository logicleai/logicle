import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest'
import { fetchApiResponse, get, post, put, delete_, patch } from '@/lib/fetch'
import * as authRedirect from '@/lib/authRedirect'

// Helper to create a minimal Response-like object
function makeResponse(status: number, body: unknown, contentType = 'application/json'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : status === 404 ? 'Not Found' : 'OK',
    headers: {
      get: (key: string) => (key.toLowerCase() === 'content-type' ? contentType : null),
    },
    json: () => Promise.resolve(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.spyOn(authRedirect, 'handleUnauthenticated').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ---- fetchApiResponse ----

describe('fetchApiResponse', () => {
  test('returns data for 200 JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { value: 42 })))
    const result = await fetchApiResponse<{ value: number }>('/api/test')
    expect(result).toEqual({ data: { value: 42 } })
  })

  test('returns empty data for 204 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(204, null, 'text/plain')))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ data: undefined })
  })

  test('returns an error when 200 but not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, 'hello', 'text/plain')))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ error: { message: 'unexpected-response', values: {} } })
  })

  test('returns an error when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ error: { message: 'network-error', values: {} } })
  })

  test('returns an error when 200 JSON body is malformed', async () => {
    const response = makeResponse(200, null)
    response.json = () => Promise.reject(new SyntaxError('Unexpected end of JSON input'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ error: { message: 'unexpected-response', values: {} } })
  })

  test('falls back to the status error when a non-ok JSON body is malformed', async () => {
    const response = makeResponse(500, null)
    response.json = () => Promise.reject(new SyntaxError('Unexpected end of JSON input'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ error: { code: 500, message: 'OK', values: {} } })
  })

  test('falls back to the status error when a non-ok JSON body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(502, {})))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({ error: { code: 502, message: 'OK', values: {} } })
  })

  test('returns error body for non-ok JSON response', async () => {
    const errBody = { error: { message: 'Not found', values: {} } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(404, errBody)))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual(errBody)
  })

  test('returns error with status+statusText for non-ok non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(500, null, 'text/plain')))
    const result = await fetchApiResponse('/api/test')
    expect(result).toEqual({
      error: { code: 500, message: 'OK', values: {} },
    })
  })

  test('triggers the unauthenticated handler on a 401 response', async () => {
    const errBody = { error: { message: 'invalid-credentials', values: {} } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401, errBody)))
    await fetchApiResponse('/api/test')
    expect(authRedirect.handleUnauthenticated).toHaveBeenCalledTimes(1)
  })

  test('does not trigger the unauthenticated handler on non-401 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { value: 42 })))
    await fetchApiResponse('/api/test')
    expect(authRedirect.handleUnauthenticated).not.toHaveBeenCalled()
  })
})

// ---- get ----

describe('get', () => {
  test('calls fetch with GET method', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, { ok: true }))
    vi.stubGlobal('fetch', mockFetch)
    await get('/api/resource')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ method: 'GET' })
    )
  })
})

// ---- post ----

describe('post', () => {
  test('calls fetch with POST method and JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, { created: true }))
    vi.stubGlobal('fetch', mockFetch)
    await post('/api/resource', { name: 'test' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'test' }) })
    )
  })

  test('calls fetch with POST method and no body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}))
    vi.stubGlobal('fetch', mockFetch)
    await post('/api/resource')
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
  })
})

// ---- put ----

describe('put', () => {
  test('calls fetch with PUT method and JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}))
    vi.stubGlobal('fetch', mockFetch)
    await put('/api/resource', { value: 1 })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ value: 1 }) })
    )
  })
})

// ---- delete_ ----

describe('delete_', () => {
  test('calls fetch with DELETE method', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(204, null, 'text/plain'))
    vi.stubGlobal('fetch', mockFetch)
    await delete_('/api/resource')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

// ---- patch ----

describe('patch', () => {
  test('calls fetch with PATCH method and JSON body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, {}))
    vi.stubGlobal('fetch', mockFetch)
    await patch('/api/resource', { field: 'updated' })
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/resource',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ field: 'updated' }) })
    )
  })
})
