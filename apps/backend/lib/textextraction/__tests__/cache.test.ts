import { describe, expect, test, vi } from 'vitest'
import { cachingExtractor } from '@/lib/textextraction/cache'

const extractor = vi.fn(async () => {
  throw new Error('Unencoded <\nLine: 85\nColumn: 83\nChar: 0')
})

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
  })
})
