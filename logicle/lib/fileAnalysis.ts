import env from '@/lib/env'
import { logger } from '@/lib/logging'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import { completeFileAnalysis, failFileAnalysis, inferFileAnalysisKind } from '@/models/fileAnalysis'
import type * as dto from '@/types/dto/file-analysis'

export const fileAnalyzerVersion = 1

interface Deferred {
  resolve: () => void
  promise: Promise<void>
}

class FileAnalysisRuntime {
  private running = false
  private readonly queue: string[] = []
  private readonly inFlight = new Map<string, Deferred>()

  // Returns a promise that resolves when analysis for fileId completes (success or failure).
  // If already submitted, returns the existing promise.
  submit(fileId: string): Promise<void> {
    const existing = this.inFlight.get(fileId)
    if (existing) return existing.promise

    let resolve!: () => void
    const promise = new Promise<void>((res) => {
      resolve = res
    })
    this.inFlight.set(fileId, { resolve, promise })
    this.queue.push(fileId)
    queueMicrotask(() => void this.pump())
    return promise
  }

  private async pump() {
    if (this.running || this.queue.length === 0) return

    this.running = true
    const fileId = this.queue.shift()!
    const deferred = this.inFlight.get(fileId)
    let kind: dto.FileAnalysisKind = 'unknown'

    try {
      const file = await getFileWithId(fileId)
      if (!file || file.uploaded !== 1) {
        throw new Error(`File not ready (uploaded=${file?.uploaded ?? 'missing'})`)
      }

      kind = inferFileAnalysisKind(file.type)
      logger.info('File analysis runtime: starting analysis', { fileId, mimeType: file.type })

      // Dynamic import keeps sharp / @libpdf/core out of the Next.js module graph.
      const { analyzeFileBuffer } = await import('./fileAnalysisExtractors')
      const { storage } = await import('@/lib/storage')
      const buffer = await storage.readBuffer(file.path, !!file.encrypted)
      const payload = await analyzeFileBuffer(buffer, file.type)

      logger.info('File analysis runtime: status -> ready', { fileId, kind: payload.kind })
      await completeFileAnalysis(fileId, payload, fileAnalyzerVersion)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('File analysis runtime: failed', { fileId, error: message })
      await failFileAnalysis(fileId, kind, fileAnalyzerVersion, message)
    } finally {
      this.inFlight.delete(fileId)
      deferred?.resolve()
      this.running = false
      if (this.queue.length > 0) {
        queueMicrotask(() => void this.pump())
      }
    }
  }
}

export const fileAnalysisRuntime = new FileAnalysisRuntime()

export const scheduleFileAnalysisForFile = (file: schema.File): void => {
  if (!env.fileAnalysis.enable) return
  fileAnalysisRuntime.submit(file.id)
}
