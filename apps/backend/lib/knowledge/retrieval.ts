import { LRUCache } from 'lru-cache'
import { db } from '@/db/database'
import { Bm25Index } from './bm25'
import { loadBoxChunks, type StoredChunk } from './store'

/**
 * Per-box retrieval index, built lazily and cached.
 *
 * A box holds the files attached to one tool, so its whole chunk set fits in memory: building the
 * BM25 index costs one query and a pass over the text. The cache is keyed by box and validated
 * against a cheap "state signature" (chunk count plus the latest document update), so re-ingesting
 * a document invalidates the index without any explicit invalidation call from the write path.
 */

interface CachedIndex {
  signature: string
  index: Bm25Index
  chunks: Map<string, StoredChunk>
}

const cache = new LRUCache<string, CachedIndex>({
  max: 32,
  ttl: 1000 * 60 * 10,
  updateAgeOnGet: true,
})

export interface SearchHit {
  fileId: string
  seq: number
  heading: string | null
  text: string
  score: number
}

const computeSignature = async (boxId: string): Promise<string> => {
  const row = await db
    .selectFrom('KnowledgeBoxDocument')
    .select((eb) => [
      eb.fn.count<number>('fileId').as('documents'),
      eb.fn.sum<number>('chunkCount').as('chunks'),
      eb.fn.max('updatedAt').as('updatedAt'),
    ])
    .where('boxId', '=', boxId)
    .executeTakeFirst()
  return `${row?.documents ?? 0}:${row?.chunks ?? 0}:${row?.updatedAt ?? ''}`
}

const getIndex = async (boxId: string): Promise<CachedIndex> => {
  const signature = await computeSignature(boxId)
  const cached = cache.get(boxId)
  if (cached && cached.signature === signature) return cached

  const chunks = await loadBoxChunks(boxId)
  const built: CachedIndex = {
    signature,
    // The heading is indexed along with the body: a chunk under "Payment terms" should match a
    // query for "payment" even when the body only says "net 30".
    index: new Bm25Index(
      chunks.map((chunk) => ({
        ref: chunk.id,
        text: chunk.heading ? `${chunk.heading}\n${chunk.text}` : chunk.text,
      }))
    ),
    chunks: new Map(chunks.map((chunk) => [chunk.id, chunk])),
  }
  cache.set(boxId, built)
  return built
}

export const searchBox = async (
  boxId: string,
  query: string,
  limit: number,
  fileIds?: string[]
): Promise<SearchHit[]> => {
  const { index, chunks } = await getIndex(boxId)
  const filter = fileIds && fileIds.length > 0 ? new Set(fileIds) : undefined

  // Over-fetch when filtering by file, so the filter does not silently empty the result set.
  const hits = index.search(query, filter ? limit * 8 : limit)
  const results: SearchHit[] = []
  for (const hit of hits) {
    const chunk = chunks.get(hit.ref)
    if (!chunk) continue
    if (filter && !filter.has(chunk.fileId)) continue
    results.push({
      fileId: chunk.fileId,
      seq: chunk.seq,
      heading: chunk.heading,
      text: chunk.text,
      score: hit.score,
    })
    if (results.length >= limit) break
  }
  return results
}

/** Drops the cached index for a box. Used when a box is deleted or force-reindexed. */
export const invalidateBoxIndex = (boxId: string): void => {
  cache.delete(boxId)
}
