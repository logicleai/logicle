import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockFetch = vi.fn()
const mockSaveFile = vi.fn()
const mockResolveToolSecretReference = vi.fn(async (_toolId: string, template: string) => template)
const mockExpandEnv = vi.fn((template: string) => template)

vi.mock('undici', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
  Agent: class {
    close() {
      return Promise.resolve()
    }
  },
}))

vi.mock('@/backend/lib/tools/file-output-normalization', () => ({
  saveFile: (...args: unknown[]) => mockSaveFile(...args),
}))

vi.mock('templates', () => ({
  expandEnv: (...args: [string]) => mockExpandEnv(...args),
  resolveToolSecretReference: (...args: [string, string]) => mockResolveToolSecretReference(...args),
}))

import { OpenApiPlugin } from '@/backend/lib/tools/openapi/implementation'

const yamlSpec = `
openapi: 3.0.0
info:
  title: Test API
  version: '1.0'
servers:
  - url: https://api.example.com
paths:
  /items/{id}:
    get:
      operationId: getItem
      description: Get an item
      security:
        - apiKeyAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
        - name: verbose
          in: query
          required: false
          schema:
            type: boolean
      responses:
        '200':
          description: OK
  /items:
    post:
      operationId: createItem
      description: Create an item
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
              required:
                - name
      responses:
        '200':
          description: OK
  /unsupported:
    put:
      operationId: unsupportedOp
      requestBody:
        required: true
        content:
          application/xml:
            schema:
              type: string
      responses:
        '200':
          description: OK
components:
  securitySchemes:
    apiKeyAuth:
      type: apiKey
      in: header
      name: X-Api-Key
    bearerAuth:
      type: http
      scheme: bearer
`

const toolParams: ToolParams = {
  id: 'tool-1',
  name: 'testapi',
  promptFragment: '',
  provisioned: false,
}

const uiLink = { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] }

function invokeParams(overrides: Partial<ToolInvokeParams> = {}): ToolInvokeParams {
  return {
    llmModel: {} as never,
    messages: [],
    assistantId: 'a1',
    userId: 'u1',
    params: {},
    uiLink,
    ...overrides,
  }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockSaveFile.mockReset()
  mockResolveToolSecretReference.mockClear()
  mockExpandEnv.mockClear()
  uiLink.debugMessage.mockClear()
})

// computeSecurityHeaders resolves every scheme declared under
// components.securitySchemes for every call, regardless of which operation's
// `security` list references it — so both schemes need a value configured.
async function buildPlugin(config: Record<string, unknown> = {}) {
  return (await OpenApiPlugin.builder(
    toolParams,
    { spec: yamlSpec, apiKeyAuth: 'k', bearerAuth: 't', ...config },
    'gpt-4o-mini'
  )) as OpenApiPlugin
}

describe('OpenApiPlugin spec conversion', () => {
  it('builds one tool function per operation, merging path/query params into the schema', async () => {
    const plugin = await buildPlugin()
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    expect(functions.getItem).toBeDefined()
    const getItem = functions.getItem as ToolFunction
    expect(getItem.description).toBe('Get an item')
    expect(getItem.parameters).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, verbose: { type: 'boolean' } },
      required: ['id'],
      additionalProperties: false,
    })
  })

  it('merges the request body schema in as a required "body" property', async () => {
    const plugin = await buildPlugin()
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const createItem = functions.createItem as ToolFunction
    expect(createItem.parameters).toMatchObject({
      required: ['body'],
      properties: {
        body: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      },
    })
  })

  it('skips an operation whose request body media type is unsupported', async () => {
    const plugin = await buildPlugin()
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    expect(functions.unsupportedOp).toBeUndefined()
  })

  it('returns no functions and does not throw for an unparseable spec', async () => {
    const plugin = await buildPlugin({ spec: 'not: [valid, openapi' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    expect(functions).toEqual({})
  })
})

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

describe('OpenApiPlugin invoke: request building', () => {
  it('substitutes path params, sets query params, and resolves an apiKey security header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }))
    const plugin = await buildPlugin({ apiKeyAuth: 'my-api-key' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: 'abc 123', verbose: true } })
    )

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, requestInit] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/items/abc%20123?verbose=true')
    expect(requestInit.method).toBe('GET')
    expect(requestInit.headers['X-Api-Key']).toBe('my-api-key')
    expect(mockResolveToolSecretReference).toHaveBeenCalledWith('tool-1', 'my-api-key')
  })

  it('builds a JSON body and a bearer Authorization header, prefixing "Bearer " when missing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 1 }))
    const plugin = await buildPlugin({ bearerAuth: 'token123' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    await (functions.createItem as ToolFunction).invoke(
      invokeParams({ params: { body: { name: 'widget' } } })
    )

    const [url, requestInit] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/items')
    expect(requestInit.method).toBe('POST')
    expect(requestInit.body).toBe(JSON.stringify({ name: 'widget' }))
    expect(requestInit.headers['content-type']).toBe('application/json')
    expect(requestInit.headers.Authorization).toBe('Bearer token123')
  })

  it('does not double-prefix an already-Bearer-prefixed token', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    const plugin = await buildPlugin({ bearerAuth: 'Bearer already-prefixed' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    await (functions.createItem as ToolFunction).invoke(
      invokeParams({ params: { body: { name: 'x' } } })
    )

    const [, requestInit] = mockFetch.mock.calls[0]
    expect(requestInit.headers.Authorization).toBe('Bearer already-prefixed')
  })

  it('reports HTTP request details through uiLink.debugMessage when debug is set', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}))
    const plugin = await buildPlugin({ bearerAuth: 'token123' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    await (functions.createItem as ToolFunction).invoke(
      invokeParams({ params: { body: { name: 'x' } }, debug: true })
    )

    expect(uiLink.debugMessage).toHaveBeenCalledTimes(1)
    const [message, details] = uiLink.debugMessage.mock.calls[0]
    expect(message).toBe('HTTP POST https://api.example.com/items')
    expect(details.headers.Authorization).toBe('<hidden>')
  })

  it('throws when a configured security parameter is missing', async () => {
    const plugin = (await OpenApiPlugin.builder(
      toolParams,
      { spec: yamlSpec },
      'gpt-4o-mini'
    )) as OpenApiPlugin
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    await expect(
      (functions.getItem as ToolFunction).invoke(invokeParams({ params: { id: '1' } }))
    ).rejects.toThrow(/apiKeyAuth not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('OpenApiPlugin invoke: response handling', () => {
  it('parses a JSON response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 42 }))
    const plugin = await buildPlugin({ apiKeyAuth: 'k' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const result = await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: '1' } })
    )
    expect(result).toEqual({ type: 'json', value: { id: 42 } })
  })

  it('returns plain text for a text/plain response', async () => {
    mockFetch.mockResolvedValue(
      new Response('hello world', { status: 200, headers: { 'content-type': 'text/plain' } })
    )
    const plugin = await buildPlugin({ apiKeyAuth: 'k' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const result = await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: '1' } })
    )
    expect(result).toEqual({ type: 'text', value: 'hello world' })
  })

  it('returns an error-text result for a non-2xx status, without throwing', async () => {
    mockFetch.mockResolvedValue(
      new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    )
    const plugin = await buildPlugin({ apiKeyAuth: 'k' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const result = await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: '1' } })
    )
    expect(result).toEqual({
      type: 'error-text',
      value: 'Http request failed with status 404: not found',
    })
  })

  it('persists a Content-Disposition: attachment response as a file', async () => {
    mockFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment; filename="report.bin"',
        },
      })
    )
    mockSaveFile.mockResolvedValue({
      type: 'file',
      id: 'file-1',
      mimetype: 'application/octet-stream',
      name: 'report.bin',
      size: 3,
    })
    const plugin = await buildPlugin({ apiKeyAuth: 'k' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const result = await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: '1' } })
    )
    expect(result.type).toBe('content')
    if (result.type !== 'content') throw new Error('expected content result')
    expect(result.value).toHaveLength(2)
    expect(result.value[1]).toEqual({
      type: 'file',
      id: 'file-1',
      mimetype: 'application/octet-stream',
      name: 'report.bin',
      size: 3,
    })
    expect(mockSaveFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/octet-stream', nameHint: 'report.bin' })
    )
  })

  it('persists a binary response with no Content-Disposition as a file', async () => {
    mockFetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    )
    mockSaveFile.mockResolvedValue({
      type: 'file',
      id: 'file-2',
      mimetype: 'image/png',
      name: 'response.bin',
      size: 3,
    })
    const plugin = await buildPlugin({ apiKeyAuth: 'k' })
    const functions = await plugin.functions({} as never, { userId: 'u1' })

    const result = await (functions.getItem as ToolFunction).invoke(
      invokeParams({ params: { id: '1' } })
    )
    expect(result).toEqual({ type: 'content', value: [{
      type: 'file',
      id: 'file-2',
      mimetype: 'image/png',
      name: 'response.bin',
      size: 3,
    }] })
  })
})
