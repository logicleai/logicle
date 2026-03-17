import type { AnalyzerPayload } from './analyzers.ts'

export interface FileAnalyzerRuntime {
  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload>
}

class DefaultRuntime implements FileAnalyzerRuntime {
  async analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    const { analyzeFileBuffer } = await import('./analyzers.ts')
    return analyzeFileBuffer(buffer, mimeType)
  }
}

// Use globalThis so the singleton is shared across module instances (e.g. the
// tsup-compiled server.js and the Next.js bundle both inline this package, but
// they share the same globalThis — so setRuntime() called from server.ts is
// visible to getRuntime() calls inside Next.js API routes).
const GLOBAL_RUNTIME_KEY = '__file_analyzer_runtime__'
declare global {
  // eslint-disable-next-line no-var
  var __file_analyzer_runtime__: FileAnalyzerRuntime | undefined
}

export const getRuntime = (): FileAnalyzerRuntime => {
  if (!globalThis[GLOBAL_RUNTIME_KEY]) {
    globalThis[GLOBAL_RUNTIME_KEY] = new DefaultRuntime()
  }
  return globalThis[GLOBAL_RUNTIME_KEY]
}

export const setRuntime = (runtime: FileAnalyzerRuntime): void => {
  globalThis[GLOBAL_RUNTIME_KEY] = runtime
}
