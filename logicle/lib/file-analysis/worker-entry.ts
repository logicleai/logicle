import { parentPort, workerData } from 'node:worker_threads'

type WorkerInput = {
  buffer: Uint8Array
  mimeType: string
}

type AnalyzeFileResult =
  | {
      ok: true
      payload: unknown
    }
  | {
      ok: false
      error: string
    }

const run = async (input: WorkerInput): Promise<AnalyzeFileResult> => {
  try {
    const { analyzeFileBuffer } = await import(new URL('./extractors.ts', import.meta.url).href)
    const payload = await analyzeFileBuffer(Buffer.from(input.buffer), input.mimeType)
    return {
      ok: true,
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

void run(workerData as WorkerInput).then((result) => {
  parentPort?.postMessage({
    type: 'result',
    result,
  })
})
