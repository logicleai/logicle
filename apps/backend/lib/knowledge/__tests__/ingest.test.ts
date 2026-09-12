import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetFileWithId = vi.fn()
const mockExtractFromFile = vi.fn()
const mockReadBuffer = vi.fn()
const mockDescribeImageForIndex = vi.fn()
const mockComputeProjections = vi.fn()
const mockExecuteTakeFirst = vi.fn()

vi.mock('@/models/file', () => ({
  getFileWithId: (...args: unknown[]) => mockGetFileWithId(...args),
}))
vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: (...args: unknown[]) => mockExtractFromFile(...args) },
}))
vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: (...args: unknown[]) => mockReadBuffer(...args) },
}))
vi.mock('@/backend/lib/knowledge/projections', () => ({
  computeProjections: (...args: unknown[]) => mockComputeProjections(...args),
  describeImageForIndex: (...args: unknown[]) => mockDescribeImageForIndex(...args),
  emptyProjectionUsage: () => ({ inputTokens: 0, outputTokens: 0, calls: 0, providerUsages: [] }),
}))
vi.mock('@/db/database', () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args) }),
      }),
    }),
  },
}))

const { ingestDocument } = await import('@/backend/lib/knowledge/ingest')

const file = {
  id: 'file-1',
  path: '/storage/chair.png',
  name: 'chair.png',
  type: 'image/png',
  size: 100,
  encryption: 'aead',
}

const emptyUsage = { inputTokens: 0, outputTokens: 0, calls: 0, providerUsages: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFileWithId.mockResolvedValue(file)
  mockExtractFromFile.mockResolvedValue('Printed product label')
  mockReadBuffer.mockResolvedValue(Buffer.from('image-bytes'))
  mockDescribeImageForIndex.mockImplementation(async (...args: unknown[]) => {
    const usage = args[3] as { calls: number; modelId?: string }
    usage.calls += 1
    usage.modelId = 'vision-mini'
    return 'a grey upholstered chair with black legs'
  })
  mockComputeProjections.mockResolvedValue({ projections: [], usage: emptyUsage })
  mockExecuteTakeFirst.mockResolvedValue({ configuration: JSON.stringify({ questions: [] }) })
})

describe('knowledge ingestion for images', () => {
  it('combines OCR text and a visual index for an image document', async () => {
    const result = await ingestDocument('box-1', 'file-1')

    expect(mockDescribeImageForIndex).toHaveBeenCalledWith(
      'chair.png',
      'image/png',
      Buffer.from('image-bytes'),
      expect.objectContaining({ calls: 1 })
    )
    const indexedText = result.chunks.map((chunk) => chunk.text).join('\n')
    expect(indexedText).toContain('Printed product label')
    expect(indexedText).toContain('grey upholstered chair')
  })

  it('makes an image-only document searchable when the visual model returns a description', async () => {
    mockExtractFromFile.mockResolvedValue(undefined)

    const result = await ingestDocument('box-1', 'file-1')

    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.heading).toBe(
      'Visual index (AI-generated; verify against the original file)'
    )
    expect(mockComputeProjections).not.toHaveBeenCalled()
    expect(result.projectionUsage.calls).toBe(1)
  })

  it('keeps failing an image when neither OCR nor visual indexing is available', async () => {
    mockExtractFromFile.mockResolvedValue(undefined)
    mockDescribeImageForIndex.mockResolvedValue(null)

    await expect(ingestDocument('box-1', 'file-1')).rejects.toThrow(
      'No text could be extracted from "chair.png"'
    )
  })
})
