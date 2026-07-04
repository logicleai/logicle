import { describe, expect, it, vi, beforeEach } from 'vitest'
import { KnowledgePlugin, loadKnowledgeFilePart } from '@/backend/lib/tools/knowledge/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockExecuteTakeFirst = vi.fn()
const mockExtractFromFile = vi.fn()
const mockDtoFileToLlmFilePart = vi.fn()
const envMock = vi.hoisted(() => ({ knowledge: { alwaysConvertToText: false } }))

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: () => ({
      leftJoin: () => ({
        select: () => ({
          where: () => ({
            executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args),
          }),
        }),
      }),
    }),
  },
}))

vi.mock('@/lib/env', () => ({ default: envMock }))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: (...args: unknown[]) => mockExtractFromFile(...args) },
}))

vi.mock('@/backend/lib/chat/conversion', () => ({
  dtoFileToLlmFilePart: (...args: unknown[]) => mockDtoFileToLlmFilePart(...args),
}))

beforeEach(() => {
  mockExecuteTakeFirst.mockReset()
  mockExtractFromFile.mockReset()
  mockDtoFileToLlmFilePart.mockReset()
  envMock.knowledge.alwaysConvertToText = false
})

const toolParams: ToolParams = {
  id: 'tool-1',
  provisioned: false,
  promptFragment: '',
  name: 'knowledge',
}

const fileEntry = { id: 'file-1', name: 'doc.pdf', type: 'application/pdf', size: 42 }

function makeInvokeParams(
  id: string,
  supportedMedia: string[] = []
): ToolInvokeParams {
  return {
    llmModel: { capabilities: { supportedMedia } } as any,
    messages: [],
    assistantId: 'assistant-1',
    userId: 'user-1',
    params: { id },
    uiLink: {
      debugMessage: vi.fn(),
      addCitations: vi.fn(),
      attachments: [],
      citations: [],
    },
  }
}

describe('KnowledgePlugin GetFile', () => {
  it('returns an error when the file cannot be found', async () => {
    mockExecuteTakeFirst.mockResolvedValue(undefined)
    const plugin = new KnowledgePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.GetFile.invoke(makeInvokeParams('missing'))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns the file as a native attachment when the model natively supports its media type', async () => {
    mockExecuteTakeFirst.mockResolvedValue(fileEntry)
    envMock.knowledge.alwaysConvertToText = false
    const plugin = new KnowledgePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.GetFile.invoke(makeInvokeParams('file-1', ['application/pdf']))

    expect(result).toEqual({
      type: 'content',
      value: [{ type: 'file', id: 'file-1', name: 'doc.pdf', size: 42, mimetype: 'application/pdf' }],
    })
    expect(mockExtractFromFile).not.toHaveBeenCalled()
  })

  it('extracts text when the model does not natively support the media type', async () => {
    mockExecuteTakeFirst.mockResolvedValue(fileEntry)
    mockExtractFromFile.mockResolvedValue('extracted content')
    const plugin = new KnowledgePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.GetFile.invoke(makeInvokeParams('file-1', []))

    expect(result).toEqual({ type: 'text', value: 'extracted content' })
  })

  it('always extracts text when alwaysConvertToText is set, even for natively supported media', async () => {
    mockExecuteTakeFirst.mockResolvedValue(fileEntry)
    mockExtractFromFile.mockResolvedValue('extracted content')
    envMock.knowledge.alwaysConvertToText = true
    const plugin = new KnowledgePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.GetFile.invoke(makeInvokeParams('file-1', ['application/pdf']))

    expect(result).toEqual({ type: 'text', value: 'extracted content' })
  })

  it('returns an error when text extraction yields nothing', async () => {
    mockExecuteTakeFirst.mockResolvedValue(fileEntry)
    mockExtractFromFile.mockResolvedValue(undefined)
    const plugin = new KnowledgePlugin(toolParams, {})
    const fns = (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.GetFile.invoke(makeInvokeParams('file-1', []))

    expect(result).toEqual({ type: 'error-text', value: 'Failed extracting the content of the file' })
  })
})

describe('loadKnowledgeFilePart', () => {
  it('returns a text part explaining the file is missing when it cannot be found', async () => {
    mockExecuteTakeFirst.mockResolvedValue(undefined)

    const result = await loadKnowledgeFilePart({ id: 'missing' } as any, {} as any)

    expect(result).toEqual({
      type: 'text',
      text: 'The knowledge file with id missing could not be found.',
    })
  })

  it('delegates to dtoFileToLlmFilePart when the file exists', async () => {
    mockExecuteTakeFirst.mockResolvedValue(fileEntry)
    mockDtoFileToLlmFilePart.mockResolvedValue({ type: 'file', data: 'x' })
    const llmModel = { capabilities: {} } as any

    const result = await loadKnowledgeFilePart({ id: 'file-1' } as any, llmModel)

    expect(mockDtoFileToLlmFilePart).toHaveBeenCalledWith(fileEntry, llmModel.capabilities)
    expect(result).toEqual({ type: 'file', data: 'x' })
  })
})
