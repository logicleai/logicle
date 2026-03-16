import { analyzeFileBuffer, AnalyzerPayload } from './analyzers'

export interface FileAnalyzerRuntime {
  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload>
}

class DefaultRuntime implements FileAnalyzerRuntime {
  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    return analyzeFileBuffer(buffer, mimeType)
  }
}

let _runtime: FileAnalyzerRuntime = new DefaultRuntime()

export const getRuntime = (): FileAnalyzerRuntime => _runtime

export const setRuntime = (runtime: FileAnalyzerRuntime): void => {
  _runtime = runtime
}
