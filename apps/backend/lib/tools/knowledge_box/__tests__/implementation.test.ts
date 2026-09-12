import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeBoxTool } from '@/backend/lib/tools/knowledge_box/implementation'
import type {
  ToolFunction,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'

const mockSearchBox = vi.fn()
const mockSearchBoxDocuments = vi.fn()
const mockGetFileWithId = vi.fn()
const mockCanAccessFile = vi.fn()
const mockListBoxDocuments = vi.fn()
const mockLoadBoxProjections = vi.fn()
const mockLoadFileChunkRange = vi.fn()

vi.mock('@/backend/lib/knowledge/retrieval', () => ({
  searchBox: (...args: unknown[]) => mockSearchBox(...args),
  searchBoxDocuments: (...args: unknown[]) => mockSearchBoxDocuments(...args),
}))
vi.mock('@/backend/lib/knowledge/store', () => ({
  listBoxDocuments: (...args: unknown[]) => mockListBoxDocuments(...args),
  loadBoxProjections: (...args: unknown[]) => mockLoadBoxProjections(...args),
  loadFileChunkRange: (...args: unknown[]) => mockLoadFileChunkRange(...args),
}))
vi.mock('@/models/file', () => ({
  getFileWithId: (...args: unknown[]) => mockGetFileWithId(...args),
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))

const toolParams: ToolParams = { id: 'box1', name: 'kb', provisioned: false, promptFragment: '' }

const files = [
  { id: 'f1', name: 'contract.pdf', type: 'application/pdf', size: 10 },
  { id: 'f2', name: 'privacy.docx', type: 'application/msword', size: 20 },
]
const questions = [
  { id: 'q1', title: 'Topics', prompt: 'What is this about?' },
  { id: 'q2', title: 'Parties', prompt: 'Who signed it?' },
]

const buildTool = (overrides: Record<string, unknown> = {}) =>
  KnowledgeBoxTool.builder(
    toolParams,
    {
      files,
      questions,
      maxSearchResults: 5,
      ...overrides,
    },
    'gpt-4o-mini'
  ) as KnowledgeBoxTool

const invoke = async (tool: KnowledgeBoxTool, name: string, params: Record<string, unknown>) => {
  const fn = tool.functions_[name] as ToolFunction
  return fn.invoke({ params, userId: 'user-1', messages: [] } as unknown as ToolInvokeParams)
}

const sourceLookupMessages = [
  {
    role: 'tool',
    parts: [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'knowledge_box__search',
        result: { type: 'text', value: 'source passage' },
      },
    ],
  },
] as unknown as ToolInvokeParams['messages']

const invokeWithSourceLookup = async (
  tool: KnowledgeBoxTool,
  name: string,
  params: Record<string, unknown>
) => {
  const fn = tool.functions_[name] as ToolFunction
  return fn.invoke({
    params,
    userId: 'user-1',
    messages: sourceLookupMessages,
  } as unknown as ToolInvokeParams)
}

const readyDocument = (fileId: string, chunkCount: number) => ({
  boxId: 'box1',
  fileId,
  status: 'ready',
  error: null,
  chunkCount,
  updatedAt: '2026-01-01T00:00:00.000Z',
})

beforeEach(() => {
  mockSearchBox.mockReset().mockResolvedValue([])
  mockSearchBoxDocuments.mockReset().mockResolvedValue([])
  mockListBoxDocuments.mockReset().mockResolvedValue([])
  mockLoadBoxProjections.mockReset().mockResolvedValue([])
  mockLoadFileChunkRange.mockReset().mockResolvedValue([])
  mockGetFileWithId.mockReset()
  mockCanAccessFile.mockReset().mockResolvedValue(true)
})

describe('KnowledgeBoxTool', () => {
  it('exposes the map, search, source reading, and original-file retrieval functions', () => {
    expect(Object.keys(buildTool().functions_).sort()).toEqual([
      'get_file',
      'list_documents',
      'read',
      'search',
    ])
  })

  it('does not push its files into the prompt', () => {
    // `knowledge` is what makes a tool's files part of the preamble; a box must never set it.
    expect((buildTool() as ToolImplementation).knowledge).toBeUndefined()
  })

  it('adds source-first research guidance to the system prompt', () => {
    expect(buildTool().toolParams.promptFragment).toContain(
      'treat retrieved passages as the only evidence'
    )
    expect(buildTool().toolParams.promptFragment).toContain(
      'Do not use previous assistant messages'
    )
  })

  it('keeps original-file retrieval as an expensive last resort', () => {
    expect((buildTool().functions_.get_file as ToolFunction).description).toContain(
      'do not use it for ordinary text questions'
    )
  })

  describe('list_documents', () => {
    it('reports an empty box', async () => {
      const result = await invoke(buildTool({ files: [] }), 'list_documents', {})
      expect(result).toEqual({ type: 'text', value: 'This knowledge box contains no documents.' })
    })

    it('renders the projection answers under each document', async () => {
      mockListBoxDocuments.mockResolvedValue([readyDocument('f1', 4), readyDocument('f2', 2)])
      mockLoadBoxProjections.mockResolvedValue([
        { fileId: 'f1', questionId: 'q1', answer: 'Supply of widgets' },
        { fileId: 'f1', questionId: 'q2', answer: 'Acme and Globex' },
        { fileId: 'f2', questionId: 'q1', answer: 'Data retention' },
      ])

      const result = await invoke(buildTool(), 'list_documents', {})
      expect(result.type).toBe('text')
      const value = result.value as string
      expect(value).toContain('## contract.pdf')
      expect(value).toContain('id: f1')
      expect(value).toContain('type: application/pdf')
      expect(value).toContain('size: 10 bytes')
      expect(value).toContain('chunks: 0..3')
      expect(value).toContain('Topics: Supply of widgets')
      expect(value).toContain('Parties: Acme and Globex')
      expect(value).toContain('Topics: Data retention')
    })

    it('omits questions that produced no answer', async () => {
      mockListBoxDocuments.mockResolvedValue([readyDocument('f1', 1)])
      mockLoadBoxProjections.mockResolvedValue([{ fileId: 'f1', questionId: 'q1', answer: null }])
      const result = await invoke(buildTool({ files: [files[0]] }), 'list_documents', {})
      expect(result.value as string).not.toContain('Topics:')
    })

    it('surfaces the ingestion status of documents that are not ready', async () => {
      mockListBoxDocuments.mockResolvedValue([
        { ...readyDocument('f1', 0), status: 'failed', error: 'No text could be extracted' },
      ])
      const result = await invoke(buildTool({ files: [files[0]] }), 'list_documents', {})
      const value = result.value as string
      expect(value).toContain('status: failed')
      expect(value).toContain('error: No text could be extracted')
    })

    it('reports files that were never indexed', async () => {
      const result = await invoke(buildTool({ files: [files[0]] }), 'list_documents', {})
      expect(result.value as string).toContain('status: not indexed')
    })

    it('does not rank when no query is given', async () => {
      await invoke(buildTool(), 'list_documents', {})
      expect(mockSearchBoxDocuments).not.toHaveBeenCalled()
    })

    it('ranks documents by the query and returns them in that order', async () => {
      mockListBoxDocuments.mockResolvedValue([readyDocument('f1', 1), readyDocument('f2', 1)])
      mockSearchBoxDocuments.mockResolvedValue(['f2', 'f1'])
      const result = await invoke(buildTool(), 'list_documents', { query: 'privacy' })
      const value = result.value as string
      expect(mockSearchBoxDocuments).toHaveBeenCalledWith('box1', 'privacy', 10)
      expect(value.indexOf('privacy.docx')).toBeLessThan(value.indexOf('contract.pdf'))
    })

    it('tops up with unranked documents when the query matched fewer than the limit', async () => {
      mockListBoxDocuments.mockResolvedValue([readyDocument('f1', 1), readyDocument('f2', 1)])
      mockSearchBoxDocuments.mockResolvedValue(['f2'])
      const value = (await invoke(buildTool(), 'list_documents', { query: 'privacy' }))
        .value as string
      expect(value).toContain('privacy.docx')
      expect(value).toContain('contract.pdf')
    })

    it('caps the number of documents and says how many were left out', async () => {
      const many = Array.from({ length: 30 }, (_, index) => ({
        id: `f${index}`,
        name: `doc-${index}.pdf`,
        type: 'application/pdf',
        size: 1,
      }))
      const value = (await invoke(buildTool({ files: many }), 'list_documents', { limit: 3 }))
        .value as string
      expect(value).toContain('showing 3 of 30 documents')
      expect(value).toContain('doc-0.pdf')
      expect(value).not.toContain('doc-4.pdf')
    })

    it('clamps an absurd limit instead of returning the whole box', async () => {
      const many = Array.from({ length: 80 }, (_, index) => ({
        id: `f${index}`,
        name: `doc-${index}.pdf`,
        type: 'application/pdf',
        size: 1,
      }))
      const value = (await invoke(buildTool({ files: many }), 'list_documents', { limit: 9999 }))
        .value as string
      expect(value).toContain('showing 50 of 80 documents')
    })

    it('keeps the listing bounded when projections are long', async () => {
      // Thirty documents, each with a 1kB answer: without a budget this listing would be ~30kB.
      const many = Array.from({ length: 30 }, (_, index) => ({
        id: `f${index}`,
        name: `doc-${index}.pdf`,
        type: 'application/pdf',
        size: 1,
      }))
      mockListBoxDocuments.mockResolvedValue(many.map((file) => readyDocument(file.id, 1)))
      mockLoadBoxProjections.mockResolvedValue(
        many.map((file) => ({ fileId: file.id, questionId: 'q1', answer: 'x'.repeat(1000) }))
      )
      const value = (await invoke(buildTool({ files: many }), 'list_documents', { limit: 30 }))
        .value as string
      expect(value.length).toBeLessThan(12_000)
      expect(value).toContain('answers omitted')
      // Every document is still listed by id, so the model can reach the ones that were trimmed.
      expect(value).toContain('id: f29')
    })
  })

  describe('search', () => {
    it('rejects an empty query', async () => {
      const result = await invoke(buildTool(), 'search', { query: '  ' })
      expect(result).toEqual({ type: 'error-text', value: 'Empty search query' })
      expect(mockSearchBox).not.toHaveBeenCalled()
    })

    it('scopes the search to the box and passes the configured limit', async () => {
      await invoke(buildTool(), 'search', { query: 'payment' })
      expect(mockSearchBox).toHaveBeenCalledWith('box1', 'payment', 5, undefined)
    })

    it('forwards a file filter', async () => {
      await invoke(buildTool(), 'search', { query: 'payment', fileIds: ['f2', 7] })
      expect(mockSearchBox).toHaveBeenCalledWith('box1', 'payment', 5, ['f2'])
    })

    it('accepts exact document names as file filters', async () => {
      await invoke(buildTool(), 'search', { query: 'payment', fileIds: ['privacy.docx'] })
      expect(mockSearchBox).toHaveBeenCalledWith('box1', 'payment', 5, ['f2'])
    })

    it('rejects unknown file selectors instead of widening the search', async () => {
      const result = await invoke(buildTool(), 'search', {
        query: 'payment',
        fileIds: ['missing.pdf'],
      })
      expect(result).toEqual({
        type: 'error-text',
        value:
          'Every file selector must be a document id or exact document name from list_documents.',
      })
      expect(mockSearchBox).not.toHaveBeenCalled()
    })

    it('renders hits with the document name, id and chunk index', async () => {
      mockSearchBox.mockResolvedValue([
        { fileId: 'f1', seq: 3, heading: 'Payment terms', text: 'Net 30 days.', score: 2 },
      ])
      const result = await invoke(buildTool(), 'search', { query: 'payment' })
      const value = result.value as string
      expect(value).toContain('Treat the passages below as source evidence')
      expect(value).toContain('contract.pdf')
      expect(value).toContain('id: f1')
      expect(value).toContain('chunk 3')
      expect(value).toContain('Payment terms')
      expect(value).toContain('Net 30 days.')
    })

    it('reports an empty result set', async () => {
      const result = await invoke(buildTool(), 'search', { query: 'unicorn' })
      expect(result.value).toBe('No passage matched "unicorn".')
    })
  })

  describe('read', () => {
    it('refuses a document that is not in the box', async () => {
      const result = await invoke(buildTool(), 'read', { fileId: 'other' })
      expect(result).toEqual({
        type: 'error-text',
        value: 'Document other is not in this knowledge box',
      })
      expect(mockLoadFileChunkRange).not.toHaveBeenCalled()
    })

    it('defaults to the first chunks of the document', async () => {
      await invoke(buildTool(), 'read', { fileId: 'f1' })
      expect(mockLoadFileChunkRange).toHaveBeenCalledWith('box1', 'f1', 0, 11)
    })

    it('accepts an exact document name', async () => {
      await invoke(buildTool(), 'read', { fileId: 'contract.pdf' })
      expect(mockLoadFileChunkRange).toHaveBeenCalledWith('box1', 'f1', 0, 11)
    })

    it('caps the requested range', async () => {
      await invoke(buildTool(), 'read', { fileId: 'f1', from: 5, to: 500 })
      expect(mockLoadFileChunkRange).toHaveBeenCalledWith('box1', 'f1', 5, 16)
    })

    it('clamps a negative start', async () => {
      await invoke(buildTool(), 'read', { fileId: 'f1', from: -4, to: 2 })
      expect(mockLoadFileChunkRange).toHaveBeenCalledWith('box1', 'f1', 0, 2)
    })

    it('rejects an inverted range', async () => {
      const result = await invoke(buildTool(), 'read', { fileId: 'f1', from: 8, to: 2 })
      expect(result.type).toBe('error-text')
      expect(mockLoadFileChunkRange).not.toHaveBeenCalled()
    })

    it('renders the chunks it found', async () => {
      mockLoadFileChunkRange.mockResolvedValue([
        { id: 'c1', fileId: 'f1', seq: 0, heading: 'Intro', text: 'First.' },
        { id: 'c2', fileId: 'f1', seq: 1, heading: null, text: 'Second.' },
      ])
      const result = await invoke(buildTool(), 'read', { fileId: 'f1', from: 0, to: 1 })
      expect(result.value).toContain(
        'preserve explicit conditions, exceptions, limits, and distinctions'
      )
      expect(result.value).toContain('[chunk 0 — Intro]\nFirst.\n\n[chunk 1]\nSecond.')
    })

    it('explains an empty range instead of failing', async () => {
      const result = await invoke(buildTool(), 'read', { fileId: 'f1', from: 40, to: 41 })
      expect(result.type).toBe('text')
      expect(result.value as string).toContain('may still be indexing')
    })
  })

  describe('get_file', () => {
    it('refuses a document that is not in the box', async () => {
      const result = await invoke(buildTool(), 'get_file', { fileId: 'other' })
      expect(result).toEqual({
        type: 'error-text',
        value: 'Document other is not in this knowledge box',
      })
      expect(mockCanAccessFile).not.toHaveBeenCalled()
      expect(mockGetFileWithId).not.toHaveBeenCalled()
    })

    it('returns the original configured file as a hidden tool attachment', async () => {
      mockGetFileWithId.mockResolvedValue({
        id: 'f1',
        name: 'contract.pdf',
        type: 'application/pdf',
        size: 42,
      })
      const result = await invokeWithSourceLookup(buildTool(), 'get_file', { fileId: 'f1' })
      expect(mockCanAccessFile).toHaveBeenCalledWith({ userId: 'user-1' }, 'f1')
      expect(result).toEqual({
        type: 'content',
        value: [
          {
            type: 'file',
            id: 'f1',
            name: 'contract.pdf',
            size: 42,
            mimetype: 'application/pdf',
            uiHidden: true,
          },
        ],
      })
    })

    it('accepts an exact document name', async () => {
      mockGetFileWithId.mockResolvedValue({
        id: 'f1',
        name: 'contract.pdf',
        size: 10,
        type: 'application/pdf',
      })
      const result = await invokeWithSourceLookup(buildTool(), 'get_file', {
        fileId: 'contract.pdf',
      })
      expect(mockGetFileWithId).toHaveBeenCalledWith('f1')
      expect(result.type).toBe('content')
    })

    it('does not return a configured file the caller cannot access', async () => {
      mockCanAccessFile.mockResolvedValue(false)
      const result = await invokeWithSourceLookup(buildTool(), 'get_file', { fileId: 'f1' })
      expect(result).toEqual({ type: 'error-text', value: 'File not found' })
      expect(mockGetFileWithId).not.toHaveBeenCalled()
    })

    it('does not load the original file before source lookup', async () => {
      const result = await invoke(buildTool(), 'get_file', { fileId: 'f1' })
      expect(result).toEqual({
        type: 'error-text',
        value:
          'Search or read a passage from this knowledge box before retrieving the original file.',
      })
      expect(mockCanAccessFile).not.toHaveBeenCalled()
      expect(mockGetFileWithId).not.toHaveBeenCalled()
    })
  })
})
