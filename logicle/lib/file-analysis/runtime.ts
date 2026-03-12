import env from '@/lib/env'
import { logger } from '@/lib/logging'
import { getFileWithId } from '@/models/file'
import {
  completeFileAnalysis,
  failFileAnalysis,
  listRecoverableFileAnalysisFileIds,
  markFileAnalysisProcessing,
} from '@/models/fileAnalysis'
import { FileAnalyzer, fileAnalyzerVersion } from './analyzer'

export class FileAnalysisRuntime {
  private started = false
  private running = false
  private readonly queuedFileIds = new Set<string>()
  private pollTimer: ReturnType<typeof setTimeout> | undefined

  async start(analyzer: FileAnalyzer) {
    if (this.started || !env.fileAnalysis.enable) {
      return
    }

    this.started = true
    await this.reconcilePendingWork('startup')

    logger.info('File analysis runtime prepared', {
      queued: this.queuedFileIds.size,
      provider: env.fileAnalysis.provider,
    })

    this.scheduleReconciliation()
    void this.pump(analyzer)
  }

  enqueue(fileId: string) {
    if (!env.fileAnalysis.enable) {
      return
    }
    this.queuedFileIds.add(fileId)
    queueMicrotask(() => {
      void this.pump()
    })
  }

  getQueuedFileCount() {
    return this.queuedFileIds.size
  }

  private analyzer: FileAnalyzer | undefined

  private scheduleReconciliation() {
    if (!this.started) {
      return
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
    }

    this.pollTimer = setTimeout(() => {
      void this.reconcilePendingWork('poll').finally(() => {
        void this.pump()
        this.scheduleReconciliation()
      })
    }, env.fileAnalysis.pollIntervalMs)
  }

  private async reconcilePendingWork(reason: 'startup' | 'poll') {
    try {
      const recoverableFileIds = await listRecoverableFileAnalysisFileIds(
        env.fileAnalysis.startupScanLimit
      )
      for (const fileId of recoverableFileIds) {
        this.queuedFileIds.add(fileId)
      }
    } catch (error) {
      logger.warn('Skipping file analysis reconciliation scan', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async pump(explicitAnalyzer?: FileAnalyzer) {
    this.analyzer = explicitAnalyzer ?? this.analyzer
    if (!this.analyzer || this.running || this.queuedFileIds.size === 0) {
      return
    }

    this.running = true
    const fileId = this.queuedFileIds.values().next().value as string
    this.queuedFileIds.delete(fileId)

    try {
      const file = await getFileWithId(fileId)
      if (!file || file.uploaded !== 1) {
        return
      }

      await markFileAnalysisProcessing(fileId, fileAnalyzerVersion)
      const result = await this.analyzer.analyzeFile({
        fileId: file.id,
        path: file.path,
        mimeType: file.type,
        encrypted: !!file.encrypted,
        size: file.size,
      })

      if (result.ok) {
        await completeFileAnalysis(fileId, result.payload, fileAnalyzerVersion)
      } else {
        await failFileAnalysis(fileId, result.error)
      }
    } catch (error) {
      logger.error('File analysis failed', error)
      await failFileAnalysis(
        fileId,
        error instanceof Error ? error.message : 'File analysis failed'
      )
    } finally {
      this.running = false
      if (this.queuedFileIds.size > 0) {
        queueMicrotask(() => {
          void this.pump()
        })
      }
    }
  }
}

export const fileAnalysisRuntime = new FileAnalysisRuntime()
