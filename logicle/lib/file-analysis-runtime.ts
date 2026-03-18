import type { FileAnalyzerRuntime } from '@logicle/file-analyzer'

class DefaultFileAnalyzerRuntime implements FileAnalyzerRuntime {
  async analyzeBuffer(buffer: Buffer, mimeType: string) {
    const { analyzeFileBuffer } = await import('@logicle/file-analyzer/analyzers')
    return analyzeFileBuffer(buffer, mimeType)
  }
}

let runtime: FileAnalyzerRuntime | undefined

export const getFileAnalyzerRuntime = (): FileAnalyzerRuntime => {
  if (!runtime) {
    runtime = new DefaultFileAnalyzerRuntime()
  }
  return runtime
}

export const setFileAnalyzerRuntime = (nextRuntime: FileAnalyzerRuntime): void => {
  const previousRuntime = getFileAnalyzerRuntime()
  if (previousRuntime !== nextRuntime) {
    console.info('[FileAnalyzerRuntime] Installing runtime', {
      runtime: nextRuntime.constructor.name,
      previousRuntime: previousRuntime.constructor.name,
    })
  }
  runtime = nextRuntime
}
