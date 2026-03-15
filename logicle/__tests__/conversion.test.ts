import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { LlmModelCapabilities } from '@/lib/chat/models'
import type * as dto from '@/types/dto'

const ensureFileAnalysis = vi.fn()
const readBuffer = vi.fn()
const extractFromFile = vi.fn()
const getFileWithId = vi.fn()
const warn = vi.fn()
const info = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId,
}))

vi.mock('@/lib/fileAnalysis', () => ({
  ensureFileAnalysis,
  isReadyFileAnalysis: (analysis: dto.FileAnalysis | undefined) =>
    analysis?.status === 'ready' && analysis.payload !== null,
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer,
  },
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: {
    extractFromFile,
  },
}))

vi.mock('@/lib/logging', () => ({
  logger: {
    info,
    warn,
  },
}))

const pdfCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: true,
  reasoning: false,
  supportedMedia: ['application/pdf'],
  nativePdfPageLimit: 100,
}

const pdfFile = {
  id: 'pdf-1',
  name: 'example.pdf',
  path: 'files/example.pdf',
  type: 'application/pdf',
  size: 123,
  uploaded: 1 as const,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
}

describe('dtoFileToLlmFilePart', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('returns courtesy text for native PDFs over the page limit', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 101,
        visionPageCount: 0,
        textCharCount: 0,
        hasExtractableText: false,
        imagePageCount: 101,
        contentMode: 'scanned',
        extractedTextPath: null,
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)

    const { dtoFileToLlmFilePart } = await import('@/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'text',
      text: `The file "${pdfFile.name}" with id ${pdfFile.id} could not be sent as an attachment: it has too many pages (101 pages, limit is 100). It is possible that some tools can return the content on demand`,
    })
    expect(readBuffer).not.toHaveBeenCalled()
    expect(extractFromFile).not.toHaveBeenCalled()
  })

  test('falls back to text when PDF analysis failed', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'failed',
      analyzerVersion: 1,
      payload: null,
      error: 'boom',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    extractFromFile.mockResolvedValue('fallback text')

    const { dtoFileToLlmFilePart } = await import('@/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'text',
      text: `Here is the text content of the file "${pdfFile.name}" with id ${pdfFile.id}\nfallback text`,
    })
    expect(extractFromFile).toHaveBeenCalledWith(pdfFile)
    expect(readBuffer).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  test('returns native file part for PDFs within the page limit', async () => {
    ensureFileAnalysis.mockResolvedValue({
      fileId: pdfFile.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfFile.size,
        pageCount: 10,
        visionPageCount: 0,
        textCharCount: 50,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies dto.FileAnalysis)
    readBuffer.mockResolvedValue(Buffer.from('pdf-bytes'))

    const { dtoFileToLlmFilePart } = await import('@/lib/chat/conversion')
    const part = await dtoFileToLlmFilePart(pdfFile, pdfCapabilities)

    expect(part).toEqual({
      type: 'file',
      filename: pdfFile.name,
      data: Buffer.from('pdf-bytes').toString('base64'),
      mediaType: pdfFile.type,
    })
    expect(readBuffer).toHaveBeenCalledWith(pdfFile.path, false)
  })
})
