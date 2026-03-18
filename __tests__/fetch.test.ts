import { describe, expect, test, vi, afterEach } from 'vitest'
import { fetchApiResponse, get, post, put, delete_, patch } from '@/lib/fetch'

// Helper to create a minimal Response-like object
function makeResponse(
  status: number,
  body: unknown,
  contentType = 'application/json'
): Response {
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

afterEach(() => {
  vi.unstubAllGlobals()
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

  test('throws when 200 but not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, 'hello', 'text/plain')))
    await expect(fetchApiResponse('/api/test')).rejects.toThrow('Expected application/json response')
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
})

// ---- get ----

describe('get', () => {
  test('calls fetch with GET method', async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(200, { ok: true }))
    vi.stubGlobal('fetch', mockFetch)
    await get('/api/resource')
    expect(mockFetch).toHaveBeenCalledWith('/api/resource', expect.objectContaining({ method: 'GET' }))
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
