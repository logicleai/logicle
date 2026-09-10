import { createHash } from 'node:crypto'
import { db } from '@/db/database'
import { getFileWithId } from '@/models/file'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { logger } from '@/lib/logging'
import { KnowledgeBoxSchema, type KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import { chunkText } from './chunking'
import { computeProjections } from './projections'
import {
  claimPendingDocument,
  markDocumentFailed,
  saveIngestResult,
  type IngestResult,
} from './store'

/**
 * Ingestion of one (box, file) pair: extract text, chunk it for retrieval, and answer the box's
 * questions about it. Text extraction itself is not done here — `cachingExtractor` routes the
 * heavy format parsing to the existing file-analyzer worker thread and caches the result, so this
 * pass is I/O bound (storage reads and LLM calls) and safely runs in-process.
 */

export interface BoxConfig {
  questions: KnowledgeBoxQuestion[]
}

export const loadBoxConfig = async (boxId: string): Promise<BoxConfig | undefined> => {
  const row = await db
    .selectFrom('Tool')
    .select(['configuration'])
    .where('id', '=', boxId)
    .executeTakeFirst()
  if (!row) return undefined
  try {
    const parsed = KnowledgeBoxSchema.parse(JSON.parse(row.configuration))
    return { questions: parsed.questions }
  } catch (error) {
    logger.warn('[knowledge-box] unparseable box configuration', {
      boxId,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
}

export const ingestDocument = async (boxId: string, fileId: string): Promise<IngestResult> => {
  const file = await getFileWithId(fileId)
  if (!file) throw new Error(`File ${fileId} not found`)

  const text = await cachingExtractor.extractFromFile(file)
  if (!text || text.trim().length === 0) {
    throw new Error(`No text could be extracted from "${file.name}"`)
  }

  const config = await loadBoxConfig(boxId)
  if (!config) throw new Error(`Knowledge box ${boxId} not found`)

  const chunks = chunkText(text)
  const { projections, usage } = await computeProjections(file.name, text, config.questions)

  return {
    contentHash: createHash('sha256').update(text).digest('hex'),
    chunks,
    projections,
    projectionUsage: usage,
  }
}

/**
 * Ingests at most `maxDocuments` queued documents. Returns how many were processed, so the caller
 * can keep draining while there is work instead of waiting for the next tick.
 */
export const runIngestionPass = async (maxDocuments: number): Promise<number> => {
  let processed = 0
  while (processed < maxDocuments) {
    const document = await claimPendingDocument()
    if (!document) break
    processed++
    try {
      logger.info('[knowledge-box] ingesting document', {
        boxId: document.boxId,
        fileId: document.fileId,
      })
      const result = await ingestDocument(document.boxId, document.fileId)
      await saveIngestResult(document.boxId, document.fileId, result)
      logger.info('[knowledge-box] document ingested', {
        boxId: document.boxId,
        fileId: document.fileId,
        chunks: result.chunks.length,
        projections: result.projections.length,
        projectionInputTokens: result.projectionUsage.inputTokens,
        projectionOutputTokens: result.projectionUsage.outputTokens,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('[knowledge-box] ingestion failed', {
        boxId: document.boxId,
        fileId: document.fileId,
        error: message,
      })
      await markDocumentFailed(document.boxId, document.fileId, message)
    }
  }
  return processed
}
