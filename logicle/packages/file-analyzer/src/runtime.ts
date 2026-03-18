import type { AnalyzerPayload } from './analyzers.ts'

export interface FileAnalyzerRuntime {
  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload>
}
