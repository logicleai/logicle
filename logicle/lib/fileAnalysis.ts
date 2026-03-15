import { logger } from '@/lib/logging'
import * as schema from '@/db/schema'
import { getFileWithId } from '@/models/file'
import { getFileAnalysis, completeFileAnalysis, failFileAnalysis, inferFileAnalysisKind } from '@/models/fileAnalysis'
import type * as dto from '@/types/dto/file-analysis'
import type { AnalyzerPayload } from './fileAnalysisExtractors'

export const fileAnalyzerVersion = 1

export type ReadyFileAnalysis = dto.FileAnalysis & {
  status: 'ready'
  payload: dto.FileAnalysisPayload
}

export type FailedFileAnalysis = dto.FileAnalysis & {
  status: 'failed'
}

export type CompletedFileAnalysis = ReadyFileAnalysis | FailedFileAnalysis

const serializeAnalysisPayload = (
  payload: AnalyzerPayload,
  extractedTextPath: string | null
): dto.FileAnalysisPayload => {
  const { extractedText: _extractedText, ...serializedPayload } = payload
  return {
    ...serializedPayload,
    extractedTextPath,
  }
}

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
      const extractedText = payload.extractedText

      let extractedTextPath: string | null = null
      if (extractedText) {
        extractedTextPath = `${file.path}.analysis-v${fileAnalyzerVersion}.txt`
        await storage.writeBuffer(extractedTextPath, Buffer.from(extractedText, 'utf-8'), !!file.encrypted)
      }

      logger.info('File analysis runtime: status -> ready', { fileId, kind: payload.kind })
      await completeFileAnalysis(
        fileId,
        serializeAnalysisPayload(payload, extractedTextPath),
        fileAnalyzerVersion
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('File analysis runtime: failed', { fileId, error: message })
      try {
        await failFileAnalysis(fileId, kind, fileAnalyzerVersion, message)
      } catch (persistError) {
        logger.error('File analysis runtime: failed to persist failure', {
          fileId,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        })
      }
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
  fileAnalysisRuntime.submit(file.id)
}

export const ensureFileAnalysisForFile = async (
  file: schema.File,
  waitMs = 10_000
): Promise<dto.FileAnalysis | undefined> => {
  const current = await getFileAnalysis(file.id)
  if (current && current.analyzerVersion >= fileAnalyzerVersion) {
    return current
  }

  const timeout = new Promise<void>((res) => setTimeout(res, waitMs))
  await Promise.race([fileAnalysisRuntime.submit(file.id), timeout])
  const completed = await getFileAnalysis(file.id)
  if (completed && completed.analyzerVersion < fileAnalyzerVersion) {
    throw new Error(
      `File analysis returned stale version ${completed.analyzerVersion} for file ${file.id}; expected at least ${fileAnalyzerVersion}`
    )
  }
  return completed
}

export const readExtractedTextFromAnalysis = async (
  file: schema.File,
  analysis: dto.FileAnalysis | undefined
): Promise<string | null> => {
  if (analysis?.status !== 'ready' || !analysis.payload?.extractedTextPath) {
    return null
  }
  try {
    const { storage } = await import('@/lib/storage')
    const textBuffer = await storage.readBuffer(analysis.payload.extractedTextPath, !!file.encrypted)
    return textBuffer.toString('utf-8')
  } catch (error) {
    logger.warn('File analysis runtime: failed reading extracted text sidecar', {
      fileId: file.id,
      extractedTextPath: analysis.payload.extractedTextPath,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export const isReadyFileAnalysis = (
  analysis: dto.FileAnalysis | undefined
): analysis is ReadyFileAnalysis => analysis?.status === 'ready' && analysis.payload !== null

export const isCompletedFileAnalysis = (
  analysis: dto.FileAnalysis | undefined
): analysis is CompletedFileAnalysis => analysis?.status === 'ready' || analysis?.status === 'failed'

// Ensures an up-to-date analysis row exists in DB for a file (triggering analysis if
// needed and waiting for it to complete) then returns the analysis.
export const ensureFileAnalysis = async (
  file: schema.File
): Promise<CompletedFileAnalysis> => {
  let analysis = await getFileAnalysis(file.id)
  if (!analysis || analysis.analyzerVersion < fileAnalyzerVersion) {
    // No up-to-date analysis: wait for analysis to complete fully (no timeout) so the
    // DB row is always persisted before this function returns.
    await fileAnalysisRuntime.submit(file.id)
    analysis = await getFileAnalysis(file.id)
  }
  if (!isCompletedFileAnalysis(analysis)) {
    throw new Error(`File analysis did not produce a completed result for file ${file.id}`)
  }
  return analysis
}

// Convenience wrapper for PDF files. Returns undefined if the file is not a PDF.
export const ensurePdfAnalysis = async (
  file: schema.File
): Promise<CompletedFileAnalysis | undefined> => {
  if (file.type !== 'application/pdf') return undefined
  return ensureFileAnalysis(file)
}
