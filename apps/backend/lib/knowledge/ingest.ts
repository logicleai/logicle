import { createHash } from 'node:crypto'
import { db } from '@/db/database'
import { getFileWithId } from '@/models/file'
import { cachingExtractor } from '@/lib/textextraction/cache'
import { storage } from '@/lib/storage'
import { logger } from '@/lib/logging'
import { KnowledgeBoxSchema, type KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import { chunkText } from './chunking'
import {
  computeProjections,
  describeImageForIndex,
  emptyProjectionUsage,
  type ProjectionUsage,
} from './projections'
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

const mergeProjectionUsage = (...usages: ProjectionUsage[]): ProjectionUsage => {
  const modelIds = new Set(usages.map((usage) => usage.modelId).filter(Boolean))
  return {
    inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
    outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
    calls: usages.reduce((total, usage) => total + usage.calls, 0),
    ...(modelIds.size === 1 ? { modelId: [...modelIds][0] } : {}),
    providerUsages: usages.flatMap((usage) => usage.providerUsages),
  }
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

  const extractedText = await cachingExtractor.extractFromFile(file)
  const visualUsage = emptyProjectionUsage()
  const sourceText = extractedText?.trim() ?? ''
  let text = sourceText

  if (file.type.startsWith('image/')) {
    try {
      const data = await storage.readBuffer(file.path, file.encryption)
      const description = await describeImageForIndex(file.name, file.type, data, visualUsage)
      if (description) {
        text = [
          text,
          '# Visual index (AI-generated; verify against the original file)',
          description,
        ]
          .filter((part) => part.length > 0)
          .join('\n\n')
      }
    } catch (error) {
      logger.warn('[knowledge-box] visual indexing failed', {
        fileId,
        fileName: file.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!text) {
    throw new Error(`No text could be extracted from "${file.name}"`)
  }

  const config = await loadBoxConfig(boxId)
  if (!config) throw new Error(`Knowledge box ${boxId} not found`)

  const chunks = chunkText(text)
  // A visual index is a navigation hint, not source text. Never use it to answer configured
  // document questions, otherwise an uncertain caption could become an apparently authoritative
  // projection shown by list_documents.
  const { projections, usage } = sourceText
    ? await computeProjections(file.name, sourceText, config.questions)
    : { projections: [], usage: emptyProjectionUsage() }

  return {
    contentHash: createHash('sha256').update(text).digest('hex'),
    chunks,
    projections,
    projectionUsage: mergeProjectionUsage(visualUsage, usage),
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
