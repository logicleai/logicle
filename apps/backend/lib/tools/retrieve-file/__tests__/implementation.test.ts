import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RetrieveFilePlugin } from '@/backend/lib/tools/retrieve-file/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockFileExecuteTakeFirst = vi.fn()
const mockBlobExecuteTakeFirst = vi.fn()
const mockCanAccessFile = vi.fn()
const mockExtractFromFile = vi.fn()

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
beforeEach(() => {
  mockFileExecuteTakeFirst.mockReset()
  mockBlobExecuteTakeFirst.mockReset()
  mockCanAccessFile.mockReset().mockResolvedValue(true)
  mockExtractFromFile.mockReset()
})

const toolParams: ToolParams = { id: 't1', name: 'fm', provisioned: false, promptFragment: '' }
const textOnlyModel = { capabilities: { vision: false, supportedMedia: [] } } as any

function makeInvokeParams(params: Record<string, unknown>, userId = 'user-1'): ToolInvokeParams {
  return {
    llmModel: textOnlyModel,
    messages: [],
    assistantId: 'assistant-1',
    userId,
    params,
    uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
  }
}

describe('RetrieveFilePlugin read_file', () => {
  it('returns an error when no file matches the given id', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue(undefined)
    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'missing' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns an error when the caller cannot access the file', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 10,
      path: 'files/a.txt',
    })
    mockCanAccessFile.mockResolvedValue(false)
    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns extracted text when found and accessible', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 10,
      fileBlobId: null,
      path: 'files/a.txt',
    })
    mockExtractFromFile.mockResolvedValue('text content')
    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'text', value: 'text content' })
  })
})

describe('RetrieveFilePlugin read_file blob resolution', () => {
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

    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'text', value: 'extracted' })
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

    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({
      type: 'error-text',
      value: 'The content of the file "a.txt" with id f1 could not be extracted.',
    })
    expect(mockBlobExecuteTakeFirst).not.toHaveBeenCalled()
  })
})

describe('RetrieveFilePlugin read_file not-found path', () => {
  it('returns an error when no file matches the given id', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue(undefined)
    const plugin = new RetrieveFilePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<
      string,
      ToolFunction
    >

    const result = await fns.read_file.invoke(makeInvokeParams({ id: 'missing' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })
})
