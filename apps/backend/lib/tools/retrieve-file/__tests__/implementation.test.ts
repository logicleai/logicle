import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FileManagerPlugin } from '@/backend/lib/tools/retrieve-file/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockFileExecuteTakeFirst = vi.fn()
const mockBlobExecuteTakeFirst = vi.fn()
const mockCanAccessFile = vi.fn()
const mockExtractFromFile = vi.fn()
const mockReadBuffer = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      if (table === 'File') {
        return {
          selectAll: () => ({
            where: () => ({ where: () => ({ executeTakeFirst: mockFileExecuteTakeFirst }), executeTakeFirst: mockFileExecuteTakeFirst }),
          }),
        }
      }
      return {
        select: () => ({
          where: () => ({ executeTakeFirst: mockBlobExecuteTakeFirst }),
        }),
      }
    },
  },
}))

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))
vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: (...args: unknown[]) => mockExtractFromFile(...args) },
}))
vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: (...args: unknown[]) => mockReadBuffer(...args) },
}))

beforeEach(() => {
  mockFileExecuteTakeFirst.mockReset()
  mockBlobExecuteTakeFirst.mockReset()
  mockCanAccessFile.mockReset().mockResolvedValue(true)
  mockExtractFromFile.mockReset()
  mockReadBuffer.mockReset()
})

const toolParams: ToolParams = { id: 't1', name: 'fm', provisioned: false, promptFragment: '' }

function makeInvokeParams(params: Record<string, unknown>, userId = 'user-1'): ToolInvokeParams {
  return {
    llmModel: {} as any,
    messages: [],
    assistantId: 'assistant-1',
    userId,
    params,
    uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
  }
}

describe('FileManagerPlugin getFile', () => {
  it('returns an error when no file matches the given name', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue(undefined)
    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.getFile.invoke(makeInvokeParams({ name: 'missing.txt' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns an error when the caller cannot access the matched file', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({ id: 'f1', name: 'a.txt', type: 'text/plain', size: 10 })
    mockCanAccessFile.mockResolvedValue(false)
    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.getFile.invoke(makeInvokeParams({ name: 'a.txt' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns the file as a content attachment when found and accessible', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 10,
      fileBlobId: null,
    })
    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.getFile.invoke(makeInvokeParams({ name: 'a.txt' }))

    expect(result).toEqual({
      type: 'content',
      value: [{ type: 'file', id: 'f1', size: 10, name: 'a.txt', mimetype: 'text/plain' }],
    })
  })
})

describe('FileManagerPlugin getFileDbRowBy blob resolution', () => {
  it('overrides size/encryption from the linked FileBlob row when fileBlobId is set', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 999,
      encryption: null,
      fileBlobId: 'blob-1',
      path: 'files/a.txt',
    })
    mockBlobExecuteTakeFirst.mockResolvedValue({ size: 42, encryption: 'pgp' })
    mockExtractFromFile.mockResolvedValue('extracted')

    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.getFile.invoke(makeInvokeParams({ name: 'a.txt' }))

    expect(result).toEqual({
      type: 'content',
      value: [{ type: 'file', id: 'f1', size: 42, name: 'a.txt', mimetype: 'text/plain' }],
    })
  })

  it('falls back to the File row size/encryption when there is no linked blob', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 7,
      encryption: 'none',
      fileBlobId: null,
      path: 'files/a.txt',
    })

    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.getFile.invoke(makeInvokeParams({ name: 'a.txt' }))

    expect(result).toEqual({
      type: 'content',
      value: [{ type: 'file', id: 'f1', size: 7, name: 'a.txt', mimetype: 'text/plain' }],
    })
    expect(mockBlobExecuteTakeFirst).not.toHaveBeenCalled()
  })
})

describe('FileManagerPlugin read_file not-found path', () => {
  it('returns an error when no file matches the given id', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue(undefined)
    const plugin = new FileManagerPlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'missing' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })
})
