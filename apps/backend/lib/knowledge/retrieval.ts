import { LRUCache } from 'lru-cache'
import { db } from '@/db/database'
import { Bm25Index } from './bm25'
import { loadBoxChunks, loadBoxProjections, type StoredChunk } from './store'

/**
 * Per-box retrieval index, built lazily and cached.
 *
 * A box holds the files attached to one tool, so its whole chunk set fits in memory: building the
 * BM25 index costs one query and a pass over the text. The cache is keyed by box and validated
 * against a cheap "state signature" (chunk count plus the latest document update), so re-ingesting
 * a document invalidates the index without any explicit invalidation call from the write path.
 *
 * There are two indexes per box. The chunk index answers "which passage", and backs `search`. The
 * document index answers "which document", over each document's name and its projection answers,
 * and backs `list_documents` — because a listing that returns every document's projections is
 * unbounded, and grows into the very cost the box exists to avoid once a box holds more than a
 * handful of files.
 */

interface CachedIndex {
  signature: string
  index: Bm25Index
  chunks: Map<string, StoredChunk>
  /** Ranks whole documents by name + projections. Empty when the box has no documents. */
  documentIndex: Bm25Index
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
  const projections = await loadBoxProjections(boxId)

  // One document-level entry per file: its projection answers, which is what a reader would skim
  // to decide whether the document is worth opening.
  const projectionsByFile = new Map<string, string[]>()
  for (const projection of projections) {
    if (!projection.answer) continue
    const bucket = projectionsByFile.get(projection.fileId)
    if (bucket) bucket.push(projection.answer)
    else projectionsByFile.set(projection.fileId, [projection.answer])
  }

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
    documentIndex: new Bm25Index(
      [...projectionsByFile.entries()].map(([fileId, answers]) => ({
        ref: fileId,
        text: answers.join('\n'),
      }))
    ),
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

/**
 * Ranks whole documents against a query, most relevant first.
 *
 * Prefers the projection index, which is the cheap summary layer. A box configured without
 * ingestion questions has no projections to rank, so it falls back to the chunk index and reports
 * the order in which documents first matched — that keeps `list_documents` useful either way.
 */
export const searchBoxDocuments = async (
  boxId: string,
  query: string,
  limit: number
): Promise<string[]> => {
  const { documentIndex, index, chunks } = await getIndex(boxId)

  if (documentIndex.size > 0) {
    const hits = documentIndex.search(query, limit)
    if (hits.length > 0) return hits.map((hit) => hit.ref)
  }

  // Over-fetch chunks: many of them belong to the same document, and we need `limit` distinct ones.
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const hit of index.search(query, limit * 20)) {
    const chunk = chunks.get(hit.ref)
    if (!chunk || seen.has(chunk.fileId)) continue
    seen.add(chunk.fileId)
    ordered.push(chunk.fileId)
    if (ordered.length >= limit) break
  }
  return ordered
}

/** Drops the cached index for a box. Used when a box is deleted or force-reindexed. */
export const invalidateBoxIndex = (boxId: string): void => {
  cache.delete(boxId)
}
