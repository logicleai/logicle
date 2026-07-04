import { describe, expect, it, vi } from 'vitest'
import { MeiliSearchIndex } from '../MeiliIndex'
import type { ConversationSearchDoc } from '../Index'

const toHex = (s: string) => Buffer.from(s).toString('hex')

describe('MeiliSearchIndex', () => {
  it('hex-encodes conversation ids before writing to Meilisearch (ids may contain chars Meili rejects as a primaryKey)', async () => {
    const addDocuments = vi.fn().mockResolvedValue({})
    const fakeIndex = { addDocuments } as any
    const index = new MeiliSearchIndex(fakeIndex)

    const doc: ConversationSearchDoc = {
      id: 'conv-1',
      title: 't',
      ownerId: 'o',
      assistantId: 'a',
      createdAt: '2024-01-01',
      lastMsgSentAt: null,
      messages: [],
    }
    await index.addDocuments([doc])

    expect(addDocuments).toHaveBeenCalledWith([{ ...doc, id: toHex('conv-1') }], {
      primaryKey: 'id',
    })
  })

  it('hex-encodes ids before deleting them', async () => {
    const deleteDocuments = vi.fn().mockResolvedValue({})
    const index = new MeiliSearchIndex({ deleteDocuments } as any)

    await index.deleteDocuments(['conv-1', 'conv-2'])

    expect(deleteDocuments).toHaveBeenCalledWith([toHex('conv-1'), toHex('conv-2')])
  })

  it('fetchEntriesAfterId filters by the hex-encoded cursor and decodes ids back from hex', async () => {
    const search = vi.fn().mockResolvedValue({
      hits: [{ id: toHex('conv-2'), lastMsgSentAt: '2024-01-02' }],
    })
    const index = new MeiliSearchIndex({ search } as any)

    const result = await index.fetchEntriesAfterId('conv-1', 50)

    expect(search).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        filter: `id > "${toHex('conv-1')}"`,
        sort: ['id:asc'],
        limit: 50,
      })
    )
    expect(result).toEqual([{ id: 'conv-2', lastMsgSentAt: '2024-01-02' }])
  })

  it('searchConversations combines ownerId/assistantId into an AND filter only when provided', async () => {
    const search = vi.fn().mockResolvedValue({ hits: [] })
    const index = new MeiliSearchIndex({ search } as any)

    await index.searchConversations('hello')
    expect(search).toHaveBeenCalledWith('hello', expect.objectContaining({ filter: undefined }))

    await index.searchConversations('hello', { ownerId: 'o1', assistantId: 'a1' })
    expect(search).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ filter: 'ownerId = "o1" AND assistantId = "a1"' })
    )

    await index.searchConversations('hello', { ownerId: 'o1' })
    expect(search).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({ filter: 'ownerId = "o1"' })
    )
  })

  it('searchConversations decodes ids and falls back to a rank-based score when Meili omits _rankingScore', async () => {
    const search = vi.fn().mockResolvedValue({
      hits: [
        { id: toHex('conv-1'), title: 'a', createdAt: 'c1', lastMsgSentAt: null, _formatted: { title: 'x' } },
        { id: toHex('conv-2'), title: 'b', createdAt: 'c2', lastMsgSentAt: null },
      ],
      estimatedTotalHits: 10,
    })
    const index = new MeiliSearchIndex({ search } as any)

    const results = await index.searchConversations('hello')

    expect(results[0]).toMatchObject({ id: 'conv-1', score: 10, snippet: { title: 'x' } })
    expect(results[1]).toMatchObject({ id: 'conv-2', score: 9, snippet: '' })
  })

  it('searchConversations uses the actual _rankingScore when Meili provides one', async () => {
    const search = vi.fn().mockResolvedValue({
      hits: [{ id: toHex('conv-1'), title: 'a', createdAt: 'c1', lastMsgSentAt: null, _rankingScore: 0.42 }],
      estimatedTotalHits: 10,
    })
    const index = new MeiliSearchIndex({ search } as any)

    const [result] = await index.searchConversations('hello')

    expect(result.score).toBe(0.42)
  })
})
