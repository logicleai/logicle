import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ToolInvokeParams } from '@/lib/chat/tools'

const executeTakeFirst = vi.fn()
const extractFromFile = vi.fn()
const canAccessFile = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: vi.fn(() => ({
      selectAll: vi.fn(() => ({
        where: vi.fn(() => ({
          executeTakeFirst,
        })),
      })),
    })),
  },
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: {
    extractFromFile,
  },
}))

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile,
}))

const makeModel = (
  capabilities: Partial<ToolInvokeParams['llmModel']['capabilities']>
): ToolInvokeParams['llmModel'] =>
  ({
    id: 'test-model',
    model: 'test-model',
    name: 'Test Model',
    provider: 'openai',
    owned_by: 'openai',
    description: '',
    context_length: 128000,
    capabilities,
  }) as ToolInvokeParams['llmModel']

const textOnlyModel = makeModel({ vision: false, supportedMedia: [] })
const imageModel = makeModel({ vision: true, supportedMedia: [] })

describe('retrieve-file read_file', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    canAccessFile.mockResolvedValue(true)
  })

  test('returns extracted text when available', async () => {
    const fileEntry = {
      id: 'file-1',
      name: 'note.txt',
      type: 'text/plain',
      path: 'files/note.txt',
      encryption: null,
      size: 10,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)
    extractFromFile.mockResolvedValue('hello world')

    const { RetrieveFilePlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new RetrieveFilePlugin({ id: 't1', name: 'retrieve-file', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file
    if (readFile.type === 'provider') {
      throw new Error('Expected read_file to be a function tool')
    }
    const result = await readFile.invoke({
      llmModel: textOnlyModel,
      messages: [],
      assistantId: 'a1',
      userId: 'u1',
      params: { id: 'file-1' },
      uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
    })

    expect(result).toEqual({ type: 'text', value: 'hello world' })
    expect(canAccessFile).toHaveBeenCalledWith({ userId: 'u1' }, 'file-1')
  })

  test('returns a file descriptor when the model can consume the media type', async () => {
    const fileEntry = {
      id: 'file-2',
      name: 'image.png',
      type: 'image/png',
      path: 'files/image.png',
      encryption: 'pgp',
      size: 3,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)

    const { RetrieveFilePlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new RetrieveFilePlugin({ id: 't1', name: 'retrieve-file', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file
    if (readFile.type === 'provider') {
      throw new Error('Expected read_file to be a function tool')
    }
    const result = await readFile.invoke({
      llmModel: imageModel,
      messages: [],
      assistantId: 'a1',
      userId: 'u1',
      params: { id: 'file-2' },
      uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
    })

    expect(result).toEqual({
      type: 'content',
      value: [
        {
          type: 'file',
          id: 'file-2',
          name: 'image.png',
          mimetype: 'image/png',
          size: 3,
          uiHidden: true,
        },
      ],
    })
    expect(extractFromFile).not.toHaveBeenCalled()
  })

  test('denies read_file when the caller cannot access the file', async () => {
    const fileEntry = {
      id: 'file-private',
      name: 'private.txt',
      type: 'text/plain',
      path: 'files/private.txt',
      encryption: null,
      size: 10,
    }
    executeTakeFirst.mockResolvedValue(fileEntry)
    canAccessFile.mockResolvedValue(false)

    const { RetrieveFilePlugin } = await import('@/backend/lib/tools/retrieve-file/implementation')
    const plugin = new RetrieveFilePlugin({ id: 't1', name: 'retrieve-file', provisioned: false, promptFragment: '' }, {})
    const readFile = plugin.functions_.read_file
    if (readFile.type === 'provider') {
      throw new Error('Expected read_file to be a function tool')
    }
    const result = await readFile.invoke({
      llmModel: textOnlyModel,
      messages: [],
      assistantId: 'a1',
      userId: 'u2',
      params: { id: 'file-private' },
      uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
    })

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
    expect(extractFromFile).not.toHaveBeenCalled()
  })
})
