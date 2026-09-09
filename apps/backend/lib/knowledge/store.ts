import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import type { KnowledgeBoxDocument, KnowledgeIngestStatus } from '@/db/schema'
import type { KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import type { TextChunk } from './chunking'

/**
 * Bumped whenever chunking or projection prompting changes in a way that makes already-persisted
 * rows wrong. Documents ingested at an older version are re-queued automatically, exactly like
 * `fileAnalyzerVersion` does for `FileAnalysis`.
 */
export const knowledgeIngestVersion = 1

export interface StoredChunk {
  id: string
  fileId: string
  seq: number
  heading: string | null
  text: string
}

export interface StoredProjection {
  fileId: string
  questionId: string
  answer: string | null
}

export interface IngestResult {
  contentHash: string
  chunks: TextChunk[]
  projections: { questionId: string; answer: string }[]
}

/**
 * Identifies the ingestion-relevant part of a box configuration. When it changes, every document
 * of the box needs re-ingestion: the questions determine the projections, so a new question means
 * every file has an answer missing.
 */
export const computeConfigHash = (questions: KnowledgeBoxQuestion[]): string => {
  const canonical = questions
    .map((question) => `${question.id}:${question.prompt}`)
    .sort()
    .join('\n')
  // A cheap non-cryptographic digest is enough: this only needs to detect change, not resist
  // collisions chosen by an attacker (the input is the admin's own configuration).
  let hash = 5381
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) + hash + canonical.charCodeAt(i)) | 0
  }
  return `${questions.length}-${(hash >>> 0).toString(36)}`
}

export const listBoxDocuments = async (boxId: string): Promise<KnowledgeBoxDocument[]> =>
  db.selectFrom('KnowledgeBoxDocument').selectAll().where('boxId', '=', boxId).execute()

const deleteDocumentData = async (boxId: string, fileIds: string[]) => {
  if (fileIds.length === 0) return
  await db
    .deleteFrom('KnowledgeChunk')
    .where('boxId', '=', boxId)
    .where('fileId', 'in', fileIds)
    .execute()
  await db
    .deleteFrom('KnowledgeProjection')
    .where('boxId', '=', boxId)
    .where('fileId', 'in', fileIds)
    .execute()
}

/**
 * Reconciles the persisted ingestion state of a box with its current configuration: queues newly
 * attached files, drops detached ones, and re-queues documents whose questions or ingest version
 * changed. Called on every tool create/update, and idempotent so calling it twice is free.
 */
export const syncBoxDocuments = async (
  boxId: string,
  fileIds: string[],
  configHash: string
): Promise<void> => {
  const existing = await listBoxDocuments(boxId)
  const wanted = new Set(fileIds)
  const now = new Date().toISOString()

  const removed = existing.filter((document) => !wanted.has(document.fileId))
  if (removed.length > 0) {
    const removedIds = removed.map((document) => document.fileId)
    await deleteDocumentData(boxId, removedIds)
    await db
      .deleteFrom('KnowledgeBoxDocument')
      .where('boxId', '=', boxId)
      .where('fileId', 'in', removedIds)
      .execute()
  }

  const known = new Map(existing.map((document) => [document.fileId, document]))
  for (const fileId of wanted) {
    const document = known.get(fileId)
    if (!document) {
      await db
        .insertInto('KnowledgeBoxDocument')
        .values({
          boxId,
          fileId,
          status: 'pending',
          error: null,
          contentHash: null,
          ingestVersion: knowledgeIngestVersion,
          configHash,
          chunkCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .execute()
      continue
    }
    const stale =
      document.configHash !== configHash || document.ingestVersion !== knowledgeIngestVersion
    if (!stale) continue
    await db
      .updateTable('KnowledgeBoxDocument')
      .set({
        status: 'pending',
        error: null,
        configHash,
        ingestVersion: knowledgeIngestVersion,
        updatedAt: now,
      })
      .where('boxId', '=', boxId)
      .where('fileId', '=', fileId)
      .execute()
  }
}

/** Forces re-ingestion of every document of a box, regardless of hashes. Used by the admin UI. */
export const requeueBoxDocuments = async (boxId: string): Promise<number> => {
  const result = await db
    .updateTable('KnowledgeBoxDocument')
    .set({ status: 'pending', error: null, updatedAt: new Date().toISOString() })
    .where('boxId', '=', boxId)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0)
}

export const deleteBox = async (boxId: string): Promise<void> => {
  await db.deleteFrom('KnowledgeChunk').where('boxId', '=', boxId).execute()
  await db.deleteFrom('KnowledgeProjection').where('boxId', '=', boxId).execute()
  await db.deleteFrom('KnowledgeBoxDocument').where('boxId', '=', boxId).execute()
}

/**
 * Atomically moves one pending document to `running` and returns it, or undefined when there is
 * nothing to do. The conditional `where status = 'pending'` is what makes this safe against two
 * ingestion passes overlapping.
 */
export const claimPendingDocument = async (): Promise<KnowledgeBoxDocument | undefined> => {
  const candidate = await db
    .selectFrom('KnowledgeBoxDocument')
    .selectAll()
    .where('status', '=', 'pending')
    .orderBy('updatedAt', 'asc')
    .limit(1)
    .executeTakeFirst()
  if (!candidate) return undefined

  const claimed = await db
    .updateTable('KnowledgeBoxDocument')
    .set({ status: 'running', updatedAt: new Date().toISOString() })
    .where('boxId', '=', candidate.boxId)
    .where('fileId', '=', candidate.fileId)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  if (Number(claimed.numUpdatedRows ?? 0) !== 1) return undefined

  return { ...candidate, status: 'running' }
}

/** Re-queues documents left in `running` by a process that died mid-ingestion. */
export const resetStaleRunningDocuments = async (olderThanMs: number): Promise<number> => {
  const threshold = new Date(Date.now() - olderThanMs).toISOString()
  const result = await db
    .updateTable('KnowledgeBoxDocument')
    .set({ status: 'pending', updatedAt: new Date().toISOString() })
    .where('status', '=', 'running')
    .where('updatedAt', '<', threshold)
    .executeTakeFirst()
  return Number(result.numUpdatedRows ?? 0)
}

export const saveIngestResult = async (
  boxId: string,
  fileId: string,
  result: IngestResult
): Promise<void> => {
  const now = new Date().toISOString()
  await deleteDocumentData(boxId, [fileId])

  if (result.chunks.length > 0) {
    await db
      .insertInto('KnowledgeChunk')
      .values(
        result.chunks.map((chunk) => ({
          id: nanoid(),
          boxId,
          fileId,
          seq: chunk.seq,
          heading: chunk.heading,
          text: chunk.text,
        }))
      )
      .execute()
  }

  if (result.projections.length > 0) {
    await db
      .insertInto('KnowledgeProjection')
      .values(
        result.projections.map((projection) => ({
          id: nanoid(),
          boxId,
          fileId,
          questionId: projection.questionId,
          answer: projection.answer,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .execute()
  }

  await db
    .updateTable('KnowledgeBoxDocument')
    .set({
      status: 'ready',
      error: null,
      contentHash: result.contentHash,
      chunkCount: result.chunks.length,
      updatedAt: now,
    })
    .where('boxId', '=', boxId)
    .where('fileId', '=', fileId)
    .execute()
}

export const markDocumentFailed = async (
  boxId: string,
  fileId: string,
  error: string
): Promise<void> => {
  await db
    .updateTable('KnowledgeBoxDocument')
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date().toISOString() })
    .where('boxId', '=', boxId)
    .where('fileId', '=', fileId)
    .execute()
}

export const setDocumentStatus = async (
  boxId: string,
  fileId: string,
  status: KnowledgeIngestStatus
): Promise<void> => {
  await db
    .updateTable('KnowledgeBoxDocument')
    .set({ status, updatedAt: new Date().toISOString() })
    .where('boxId', '=', boxId)
    .where('fileId', '=', fileId)
    .execute()
}

export const loadBoxChunks = async (boxId: string): Promise<StoredChunk[]> =>
  db
    .selectFrom('KnowledgeChunk')
    .select(['id', 'fileId', 'seq', 'heading', 'text'])
    .where('boxId', '=', boxId)
    .orderBy('fileId', 'asc')
    .orderBy('seq', 'asc')
    .execute()

export const loadFileChunkRange = async (
  boxId: string,
  fileId: string,
  fromSeq: number,
  toSeq: number
): Promise<StoredChunk[]> =>
  db
    .selectFrom('KnowledgeChunk')
    .select(['id', 'fileId', 'seq', 'heading', 'text'])
    .where('boxId', '=', boxId)
    .where('fileId', '=', fileId)
    .where('seq', '>=', fromSeq)
    .where('seq', '<=', toSeq)
    .orderBy('seq', 'asc')
    .execute()

export const loadBoxProjections = async (boxId: string): Promise<StoredProjection[]> =>
  db
    .selectFrom('KnowledgeProjection')
    .select(['fileId', 'questionId', 'answer'])
    .where('boxId', '=', boxId)
    .execute()
