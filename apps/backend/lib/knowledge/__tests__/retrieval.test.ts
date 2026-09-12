import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockLoadBoxChunks = vi.fn()
const mockLoadBoxFileNames = vi.fn()
const mockLoadBoxProjections = vi.fn()
let signatureRow = { documents: 0, chunks: 0, updatedAt: '' }

// `computeSignature` runs one aggregate query; the chain is stubbed down to its result so the
// cache-validation path can be exercised without a database.
vi.mock('@/db/database', () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: async () => signatureRow,
        }),
      }),
    }),
  },
}))
vi.mock('@/backend/lib/knowledge/store', () => ({
  loadBoxChunks: (...args: unknown[]) => mockLoadBoxChunks(...args),
  loadBoxFileNames: (...args: unknown[]) => mockLoadBoxFileNames(...args),
  loadBoxProjections: (...args: unknown[]) => mockLoadBoxProjections(...args),
}))

const { invalidateBoxIndex, searchBox, searchBoxDocuments } = await import(
  '@/backend/lib/knowledge/retrieval'
)

const chunk = (id: string, fileId: string, seq: number, text: string, heading?: string) => ({
  id,
  fileId,
  seq,
  heading: heading ?? null,
  text,
})

beforeEach(() => {
  mockLoadBoxChunks.mockReset().mockResolvedValue([])
  mockLoadBoxFileNames.mockReset().mockResolvedValue([])
  mockLoadBoxProjections.mockReset().mockResolvedValue([])
  signatureRow = { documents: 0, chunks: 0, updatedAt: '' }
  invalidateBoxIndex('box')
})

describe('searchBox', () => {
  it('returns the matching passage with its document and chunk index', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'Invoices are due net 30 days.', 'Payment terms'),
      chunk('c2', 'f2', 0, 'Either party may terminate with notice.'),
    ])
    const hits = await searchBox('box', 'invoices due', 5)
    expect(hits[0]).toMatchObject({ fileId: 'f1', seq: 0, heading: 'Payment terms' })
  })

  it('matches on the heading as well as the body', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'Net 30 from invoice date.', 'Payment terms'),
    ])
    expect(await searchBox('box', 'payment', 5)).toHaveLength(1)
  })

  it('finds an image document through its generated visual index', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk(
        'c1',
        'f1',
        0,
        'A grey upholstered chair with black angled legs.',
        'Visual index (AI-generated; verify against the original file)'
      ),
      chunk('c2', 'f2', 0, 'A wooden table with four legs.'),
    ])
    const hits = await searchBox('box', 'grey chair black legs', 5)
    expect(hits[0]).toMatchObject({ fileId: 'f1', seq: 0 })
  })

  it('restricts results to the requested documents', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'invoices invoices invoices'),
      chunk('c2', 'f2', 0, 'invoices'),
    ])
    const hits = await searchBox('box', 'invoices', 5, ['f2'])
    expect(hits.map((hit) => hit.fileId)).toEqual(['f2'])
  })

  it('respects the result limit', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'invoices'),
      chunk('c2', 'f2', 0, 'invoices'),
      chunk('c3', 'f3', 0, 'invoices'),
    ])
    expect(await searchBox('box', 'invoices', 2)).toHaveLength(2)
  })
})

describe('searchBoxDocuments', () => {
  it('ranks documents by their projections when the box has them', async () => {
    mockLoadBoxChunks.mockResolvedValue([chunk('c1', 'f1', 0, 'unrelated body text')])
    mockLoadBoxProjections.mockResolvedValue([
      { fileId: 'f1', questionId: 'q1', answer: 'This contract is about packaging.' },
      { fileId: 'f2', questionId: 'q1', answer: 'This contract is about data processing.' },
    ])
    expect(await searchBoxDocuments('box', 'data processing', 5)).toEqual(['f2'])
  })

  it('keeps file names searchable when projections are present', async () => {
    mockLoadBoxFileNames.mockResolvedValue([
      { fileId: 'f1', name: 'german-tax-rules.pdf' },
      { fileId: 'f2', name: 'italian-tax-rules.pdf' },
    ])
    mockLoadBoxProjections.mockResolvedValue([
      { fileId: 'f1', questionId: 'q1', answer: 'A tax reference.' },
      { fileId: 'f2', questionId: 'q1', answer: 'Another tax reference.' },
    ])
    expect(await searchBoxDocuments('box', 'german', 5)).toEqual(['f1'])
  })

  it('uses file names as the document map when projections are disabled', async () => {
    mockLoadBoxFileNames.mockResolvedValue([
      { fileId: 'f1', name: 'german-tax-rules.pdf' },
      { fileId: 'f2', name: 'italian-tax-rules.pdf' },
    ])
    expect(await searchBoxDocuments('box', 'german', 5)).toEqual(['f1'])
  })

  it('ignores projections with no answer', async () => {
    mockLoadBoxProjections.mockResolvedValue([
      { fileId: 'f1', questionId: 'q1', answer: null },
      { fileId: 'f2', questionId: 'q1', answer: 'packaging agreement' },
    ])
    expect(await searchBoxDocuments('box', 'packaging', 5)).toEqual(['f2'])
  })

  it('falls back to the chunk index for a box with no projections', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'nothing relevant here'),
      chunk('c2', 'f2', 0, 'liability is capped at one million'),
    ])
    expect(await searchBoxDocuments('box', 'liability capped', 5)).toEqual(['f2'])
  })

  it('deduplicates documents when several of their chunks match', async () => {
    mockLoadBoxChunks.mockResolvedValue([
      chunk('c1', 'f1', 0, 'liability liability'),
      chunk('c2', 'f1', 1, 'liability again'),
      chunk('c3', 'f2', 0, 'liability once'),
    ])
    expect(await searchBoxDocuments('box', 'liability', 5)).toEqual(['f1', 'f2'])
  })

  it('returns nothing when neither index matches', async () => {
    mockLoadBoxChunks.mockResolvedValue([chunk('c1', 'f1', 0, 'nothing relevant')])
    expect(await searchBoxDocuments('box', 'zzzznotaword', 5)).toEqual([])
  })

  it('honours the limit', async () => {
    mockLoadBoxProjections.mockResolvedValue([
      { fileId: 'f1', questionId: 'q1', answer: 'contract' },
      { fileId: 'f2', questionId: 'q1', answer: 'contract' },
      { fileId: 'f3', questionId: 'q1', answer: 'contract' },
    ])
    expect(await searchBoxDocuments('box', 'contract', 2)).toHaveLength(2)
  })
})

describe('index caching', () => {
  it('reuses the index while the box signature is unchanged', async () => {
    mockLoadBoxChunks.mockResolvedValue([chunk('c1', 'f1', 0, 'invoices')])
    await searchBox('box', 'invoices', 5)
    await searchBox('box', 'invoices', 5)
    expect(mockLoadBoxChunks).toHaveBeenCalledTimes(1)
  })

  it('rebuilds when a document has been re-ingested', async () => {
    mockLoadBoxChunks.mockResolvedValue([chunk('c1', 'f1', 0, 'invoices')])
    await searchBox('box', 'invoices', 5)
    signatureRow = { documents: 1, chunks: 2, updatedAt: '2026-01-01T00:00:00.000Z' }
    await searchBox('box', 'invoices', 5)
    expect(mockLoadBoxChunks).toHaveBeenCalledTimes(2)
  })

  it('rebuilds after explicit invalidation', async () => {
    mockLoadBoxChunks.mockResolvedValue([chunk('c1', 'f1', 0, 'invoices')])
    await searchBox('box', 'invoices', 5)
    invalidateBoxIndex('box')
    await searchBox('box', 'invoices', 5)
    expect(mockLoadBoxChunks).toHaveBeenCalledTimes(2)
  })
})
