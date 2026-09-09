import { logger } from '@/lib/logging'
import env from '@/lib/env'
import { runIngestionPass } from './ingest'
import { resetStaleRunningDocuments } from './store'

/**
 * Background ingestion loop.
 *
 * Ingestion is I/O bound — storage reads, an LLM round trip per question — and the only CPU-heavy
 * step (format parsing) already runs in the file-analyzer worker thread via `cachingExtractor`.
 * So this stays in-process, like `startFileOrphanCleanupRuntime`, rather than paying for a worker
 * thread that would have to re-bootstrap the database, the storage layer and the LLM backends.
 *
 * The loop is idempotent and safe to run in several replicas: `claimPendingDocument` moves a row
 * to `running` with a conditional update, so two processes never ingest the same document twice.
 */

const STALE_RUNNING_MS = 15 * 60 * 1000

let running = false
let stopped = false
let wakeUp: (() => void) | undefined

/** Asks the loop to run a pass now instead of waiting for the next tick. */
export const scheduleKnowledgeIngestion = (): void => {
  wakeUp?.()
}

const sleepUntilTickOrWakeUp = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      wakeUp = undefined
      resolve()
    }, ms)
    wakeUp = () => {
      clearTimeout(timer)
      wakeUp = undefined
      resolve()
    }
  })

export const startKnowledgeIngestionRuntime = (): void => {
  if (running) return
  running = true
  stopped = false

  const intervalMs = env.knowledgeBox.pollIntervalSeconds * 1000
  const batchSize = env.knowledgeBox.ingestBatchSize

  logger.info('[knowledge-box] starting ingestion runtime', { intervalMs, batchSize })

  void (async () => {
    while (!stopped) {
      try {
        await resetStaleRunningDocuments(STALE_RUNNING_MS)
        const processed = await runIngestionPass(batchSize)
        // Keep draining without waiting when the batch came back full.
        if (processed >= batchSize) continue
      } catch (error) {
        logger.error('[knowledge-box] ingestion pass failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      await sleepUntilTickOrWakeUp(intervalMs)
    }
    running = false
  })()
}

export const stopKnowledgeIngestionRuntime = (): void => {
  stopped = true
  wakeUp?.()
}
