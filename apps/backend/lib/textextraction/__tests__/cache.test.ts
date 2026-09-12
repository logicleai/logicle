import { describe, expect, test, vi } from 'vitest'
import { cachingExtractor } from '@/lib/textextraction/cache'

const extractor = vi.fn(async (): Promise<string> => {
  throw new Error('Unencoded <\nLine: 85\nColumn: 83\nChar: 0')
})
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
})
