import { parentPort, workerData } from 'node:worker_threads'
import { storage } from '@/lib/storage'
import { AnalyzeFileRequest, AnalyzeFileResult } from './analyzer'
import { analyzeFileBuffer } from './extractors'

const run = async (input: AnalyzeFileRequest): Promise<AnalyzeFileResult> => {
  const buffer = await storage.readBuffer(input.path, input.encrypted)
  try {
    const payload = await analyzeFileBuffer(buffer, input.mimeType)
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

void run(workerData as AnalyzeFileRequest).then((result) => {
  parentPort?.postMessage({
    type: 'result',
    result,
  })
})
