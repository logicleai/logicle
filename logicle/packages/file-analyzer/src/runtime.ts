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

let runtime: FileAnalyzerRuntime | undefined

export const getRuntime = (): FileAnalyzerRuntime => {
  if (!runtime) {
    runtime = new DefaultRuntime()
  }
  return runtime
}

export const setRuntime = (nextRuntime: FileAnalyzerRuntime): void => {
  const previousRuntime = getRuntime()
  if (previousRuntime !== nextRuntime) {
    console.info('[FileAnalyzerRuntime] Installing runtime', {
      runtime: nextRuntime.constructor.name,
      previousRuntime: previousRuntime.constructor.name,
    })
  }
  runtime = nextRuntime
}
