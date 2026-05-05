import { beforeEach, describe, expect, test, vi } from 'vitest'

const ensureFileAnalysisForFile = vi.fn()
const readExtractedTextFromAnalysis = vi.fn()
const findExtractor = vi.fn()
const readBuffer = vi.fn()

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysisForFile,
  readExtractedTextFromAnalysis,
}))

vi.mock('@/lib/textextraction/index', () => ({
  findExtractor,
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer,
  },
}))

describe('cachingExtractor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('prefers analysis-backed extracted text over direct extraction', async () => {
    const fileEntry = {
      contentHash: null,
      id: 'file-1',
      name: 'example.pdf',
      path: 'files/example.pdf',
      type: 'application/pdf',
      size: 123,
      createdAt: new Date().toISOString(),
      encrypted: 0 as const,
      ownerType: 'USER' as const,
      ownerId: 'u1',
    }

    ensureFileAnalysisForFile.mockResolvedValue({
      fileId: fileEntry.id,
      kind: 'pdf',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 123,
        pageCount: 1,
        visionPageCount: 0,
        textCharCount: 11,
        hasExtractableText: true,
        imagePageCount: 0,
        contentMode: 'text',
        extractedTextPath: 'files/example.pdf.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    readExtractedTextFromAnalysis.mockResolvedValue('hello world')

    const { cachingExtractor } = await import('@/lib/textextraction/cache')
    const text = await cachingExtractor.extractFromFile(fileEntry)

    expect(text).toBe('hello world')
    expect(readExtractedTextFromAnalysis).toHaveBeenCalledWith(
      fileEntry,
      expect.objectContaining({ fileId: fileEntry.id })
    )
    expect(findExtractor).not.toHaveBeenCalled()
    expect(readBuffer).not.toHaveBeenCalled()
  })

  test('falls back to direct extraction when analysis text is unavailable', async () => {
    const fileEntry = {
      contentHash: null,
      id: 'file-2',
      name: 'example.txt',
      path: 'files/example.txt',
      type: 'text/plain',
      size: 12,
      createdAt: new Date().toISOString(),
      encrypted: 0 as const,
      ownerType: 'USER' as const,
      ownerId: 'u1',
    }

    ensureFileAnalysisForFile.mockResolvedValue(undefined)
    readExtractedTextFromAnalysis.mockResolvedValue(null)
    const extractor = vi.fn().mockResolvedValue('fallback text')
    findExtractor.mockReturnValue(extractor)
    readBuffer.mockResolvedValue(Buffer.from('raw file'))

    const { cachingExtractor } = await import('@/lib/textextraction/cache')
    const text = await cachingExtractor.extractFromFile(fileEntry)

    expect(text).toBe('fallback text')
    expect(findExtractor).toHaveBeenCalledWith('text/plain')
    expect(readBuffer).toHaveBeenCalledWith(fileEntry.path, false)
    expect(extractor).toHaveBeenCalledWith(Buffer.from('raw file'))
  })

  test('falls back to direct extraction when analysis sidecar read fails', async () => {
    const fileEntry = {
      contentHash: null,
      id: 'file-3',
      name: 'example.txt',
      path: 'files/example.txt',
      type: 'text/plain',
      size: 12,
      createdAt: new Date().toISOString(),
      encrypted: 0 as const,
      ownerType: 'USER' as const,
      ownerId: 'u1',
    }

    ensureFileAnalysisForFile.mockResolvedValue({
      fileId: fileEntry.id,
      kind: 'word',
      status: 'ready',
      analyzerVersion: 1,
      payload: {
        kind: 'word',
        mimeType: 'text/plain',
        sizeBytes: 12,
        textCharCount: 12,
        hasExtractableText: true,
        extractedTextPath: 'files/example.txt.analysis-v1.txt',
      },
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    readExtractedTextFromAnalysis.mockResolvedValue(null)
    const extractor = vi.fn().mockResolvedValue('fallback after sidecar miss')
    findExtractor.mockReturnValue(extractor)
    readBuffer.mockResolvedValue(Buffer.from('raw file'))

    const { cachingExtractor } = await import('@/lib/textextraction/cache')
    const text = await cachingExtractor.extractFromFile(fileEntry)

    expect(text).toBe('fallback after sidecar miss')
    expect(findExtractor).toHaveBeenCalledWith('text/plain')
    expect(readBuffer).toHaveBeenCalledWith(fileEntry.path, false)
    expect(extractor).toHaveBeenCalledWith(Buffer.from('raw file'))
  })
})
