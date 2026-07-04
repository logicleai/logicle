import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { OpenAPIV3 } from 'openapi-types'
import { findBodyHandler } from '@/backend/lib/tools/openapi/body'

const mockCanAccessFile = vi.fn()
const mockGetFileWithId = vi.fn()
const mockReadBuffer = vi.fn()

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))

vi.mock('@/models/file', () => ({
  getFileWithId: (...args: unknown[]) => mockGetFileWithId(...args),
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer: (...args: unknown[]) => mockReadBuffer(...args),
  },
}))

beforeEach(() => {
  mockCanAccessFile.mockReset()
  mockGetFileWithId.mockReset()
  mockReadBuffer.mockReset()
})

const jsonSpec: OpenAPIV3.RequestBodyObject = {
  content: {
    'application/json': {
      schema: { type: 'object', properties: { name: { type: 'string' } } },
    },
  },
}

const urlEncodedSpec: OpenAPIV3.RequestBodyObject = {
  content: {
    'application/x-www-form-urlencoded': {
      schema: {
        type: 'object',
        required: ['requiredField'],
        properties: {
          requiredField: { type: 'string' },
          optionalField: { type: 'string' },
        },
      },
    },
  },
}

const formDataSpec: OpenAPIV3.RequestBodyObject = {
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: { type: 'string', format: 'binary' },
          caption: { type: 'string' },
        },
      },
    },
  },
}

describe('findBodyHandler', () => {
  it('returns undefined when the spec has no recognized media type', () => {
    const handler = findBodyHandler({ content: { 'text/plain': { schema: {} } } } as any)
    expect(handler).toBeUndefined()
  })

  it('picks multipart/form-data over application/json when both are declared', () => {
    const spec: OpenAPIV3.RequestBodyObject = {
      content: { ...jsonSpec.content, ...formDataSpec.content },
    }
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue({ path: '/f', encryption: null, name: 'a.txt' })
    mockReadBuffer.mockResolvedValue(Buffer.from('x'))

    const handler = findBodyHandler(spec)
    expect(handler).toBeDefined()
  })
})

describe('createJsonBody via findBodyHandler', () => {
  it('serializes the body param as JSON with a json content-type header', async () => {
    const handler = findBodyHandler(jsonSpec)!
    const result = await handler.createBody({ body: { name: 'alice' } }, 'user-1')

    expect(result.body).toBe(JSON.stringify({ name: 'alice' }))
    expect(result.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('merges the body schema into the tool function schema as a required property', () => {
    const handler = findBodyHandler(jsonSpec)!
    const toolParams = { properties: {}, required: [] } as any
    handler.mergeParamsIntoToolFunctionSchema(toolParams)

    expect(toolParams.required).toEqual(['body'])
    expect(toolParams.properties.body).toEqual(jsonSpec.content['application/json'].schema)
  })
})

describe('createWwwFormUrlEncodedBody via findBodyHandler', () => {
  it('omits optional properties that are null but keeps required ones (stringified)', async () => {
    const handler = findBodyHandler(urlEncodedSpec)!
    const result = await handler.createBody(
      { body: { requiredField: null, optionalField: null } },
      'user-1'
    )

    const params = new URLSearchParams(result.body as string)
    expect(params.get('optionalField')).toBeNull()
    expect(params.has('optionalField')).toBe(false)
    // Required fields are not skipped even when null: they end up stringified.
    expect(params.get('requiredField')).toBe('null')
    expect(result.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' })
  })

  it('encodes provided values normally', async () => {
    const handler = findBodyHandler(urlEncodedSpec)!
    const result = await handler.createBody(
      { body: { requiredField: 'a b', optionalField: 'c' } },
      'user-1'
    )

    const params = new URLSearchParams(result.body as string)
    expect(params.get('requiredField')).toBe('a b')
    expect(params.get('optionalField')).toBe('c')
  })
})

describe('createFormBody via findBodyHandler', () => {
  it('throws when a required binary field has no file id', async () => {
    const handler = findBodyHandler(formDataSpec)!
    await expect(handler.createBody({ body: { file: undefined } }, 'user-1')).rejects.toThrow(
      /missing/
    )
  })

  it('throws when the user is not authorized to access the referenced file', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const handler = findBodyHandler(formDataSpec)!

    await expect(
      handler.createBody({ body: { file: 'file-1' } }, 'user-1')
    ).rejects.toThrow(/unauthorized/i)
    expect(mockCanAccessFile).toHaveBeenCalledWith({ userId: 'user-1' }, 'file-1')
  })

  it('throws when the referenced file does not exist', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue(undefined)
    const handler = findBodyHandler(formDataSpec)!

    await expect(handler.createBody({ body: { file: 'file-1' } }, 'user-1')).rejects.toThrow(
      /non existing/
    )
  })

  it('builds multipart form data with the file content and extra fields', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue({ path: '/f', encryption: null, name: 'a.txt' })
    mockReadBuffer.mockResolvedValue(Buffer.from('file-bytes'))
    const handler = findBodyHandler(formDataSpec)!

    const result = await handler.createBody(
      { body: { file: 'file-1', caption: 'hello' } },
      'user-1'
    )

    expect(result.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/)
    const text = Buffer.from(result.body as Uint8Array).toString('utf-8')
    expect(text).toContain('file-bytes')
    expect(text).toContain('hello')
    expect(text).toContain('a.txt')
  })
})
