import { describe, expect, test, vi } from 'vitest'
import { cachingExtractor } from '@/lib/textextraction/cache'

const extractor = vi.fn(async (): Promise<string> => {
  throw new Error('Unencoded <\nLine: 85\nColumn: 83\nChar: 0')
})
const emptyExtractor = vi.fn(async () => '')
const mockOcr = vi.fn(
  (..._args: unknown[]): Promise<string | undefined> => Promise.resolve(undefined)
)

vi.mock('@/lib/textextraction', () => ({
  findExtractor: vi.fn(() => extractor),
  genericTextExtractor: vi.fn(),
}))

vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysisForFile: vi.fn(async () => undefined),
  readExtractedTextFromAnalysis: vi.fn(async () => null),
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    readBuffer: vi.fn(async () => Buffer.from('mock pptx bytes')),
  },
}))

vi.mock('@/lib/textextraction/ocr', () => ({
  ocrExtractor: {
    extractFromFile: (file: unknown, analysis: unknown) => mockOcr(file, analysis),
  },
}))

describe('cachingExtractor', () => {
  test('returns undefined when the file extractor fails', async () => {
    const fileEntry = {
      id: 'file-1',
      path: '/tmp/file-1.pptx',
      name: 'corrupted.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      encryption: null,
      fileBlobId: 'blob-1',
    }

    await expect(cachingExtractor.extractFromFile(fileEntry as any)).resolves.toBeUndefined()
    expect(extractor).toHaveBeenCalledTimes(1)
    expect(mockOcr).toHaveBeenCalledWith(fileEntry, undefined)
  })

  test.each([
    'Spreadsheet extraction limit exceeded: too many cell positions',
    'File analysis timed out after 12500 ms',
  ])('stops fallback after a persisted spreadsheet failure: %s', async (error) => {
    const { ensureFileAnalysisForFile } = await import('@/lib/file-analysis')
    const { storage } = await import('@/lib/storage')
    vi.mocked(ensureFileAnalysisForFile).mockResolvedValueOnce({
      kind: 'spreadsheet',
      status: 'failed',
      error,
    } as any)
    vi.mocked(storage.readBuffer).mockClear()
    mockOcr.mockClear()
    await expect(
      cachingExtractor.extractFromFile({ path: 'large.xlsx', type: 'application/vnd.ms-excel' } as any)
    ).resolves.toBeUndefined()
    expect(storage.readBuffer).not.toHaveBeenCalled()
    expect(mockOcr).not.toHaveBeenCalled()
  })

  test('tries the spreadsheet fallback after an ordinary parser failure', async () => {
    const { ensureFileAnalysisForFile } = await import('@/lib/file-analysis')
    vi.mocked(ensureFileAnalysisForFile).mockResolvedValueOnce({
      kind: 'spreadsheet',
      status: 'failed',
      error: 'Unable to parse worksheet',
    } as any)
    extractor.mockResolvedValueOnce('fallback text')
    const file = { path: 'recoverable.xls', type: 'application/vnd.ms-excel' }
    await expect(cachingExtractor.extractFromFile(file as any)).resolves.toBe('fallback text')
  })

  test('uses OCR after a scanned PDF has no extractable text', async () => {
    const analysis = {
      status: 'ready',
      payload: { kind: 'pdf', contentMode: 'scanned' },
    }
    const fileEntry = {
      id: 'file-2',
      path: '/tmp/file-2.pdf',
      name: 'scanned.pdf',
      type: 'application/pdf',
      encryption: null,
      fileBlobId: 'blob-2',
    }
    mockOcr.mockResolvedValueOnce('[OCR page 1]\nformula')

    const { ensureFileAnalysisForFile } = await import('@/lib/file-analysis')
    vi.mocked(ensureFileAnalysisForFile).mockResolvedValueOnce(analysis as any)

    await expect(cachingExtractor.extractFromFile(fileEntry as any)).resolves.toBe(
      '[OCR page 1]\nformula'
    )
    expect(mockOcr).toHaveBeenCalledWith(fileEntry, analysis)
  })

  test('does not invoke OCR when the normal PDF extractor returns text', async () => {
    mockOcr.mockClear()
    extractor.mockResolvedValueOnce('native PDF text')
    const fileEntry = {
      id: 'file-3',
      path: '/tmp/file-3.pdf',
      name: 'text.pdf',
      type: 'application/pdf',
      encryption: null,
      fileBlobId: 'blob-3',
    }

    await expect(cachingExtractor.extractFromFile(fileEntry as any)).resolves.toBe(
      'native PDF text'
    )
    expect(mockOcr).not.toHaveBeenCalled()
  })

  test('returns undefined without caching when extraction produces no text', async () => {
    const { findExtractor } = await import('@/lib/textextraction')
    vi.mocked(findExtractor).mockReturnValueOnce(emptyExtractor as any)
    const fileEntry = {
      id: 'file-empty',
      path: '/tmp/file-empty.pdf',
      name: 'scanned.pdf',
      type: 'application/pdf',
      encryption: null,
      fileBlobId: 'blob-empty',
    }

    await expect(cachingExtractor.extractFromFile(fileEntry as any)).resolves.toBeUndefined()
    expect(emptyExtractor).toHaveBeenCalledTimes(1)
  })
})
