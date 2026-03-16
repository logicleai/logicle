import type { AnalyzerPayload } from './analyzers'

export interface FileAnalyzerRuntime {
  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload>
}

class DefaultRuntime implements FileAnalyzerRuntime {
  async analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    const { analyzeFileBuffer } = await import('./analyzers')
    return analyzeFileBuffer(buffer, mimeType)
  }
}

let _runtime: FileAnalyzerRuntime = new DefaultRuntime()

export const getRuntime = (): FileAnalyzerRuntime => _runtime

export const setRuntime = (runtime: FileAnalyzerRuntime): void => {
  _runtime = runtime
}
