import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { storage } from '@/lib/storage'
import { FileAnalyzer, AnalyzeFileRequest, AnalyzeFileResult } from './analyzer'

type WorkerSuccessMessage = {
  type: 'result'
  result: AnalyzeFileResult
}

type WorkerErrorMessage = {
  type: 'error'
  error: string
}

type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage

const createWorkerScriptUrl = () => {
  return process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), 'dist-server/worker-entry.js')
    : path.resolve(process.cwd(), 'lib/file-analysis/worker-entry.ts')
}

const createWorkerExecArgv = () => {
  return process.env.NODE_ENV === 'production' ? [] : ['--import=tsx']
}

export class LocalWorkerFileAnalyzer implements FileAnalyzer {
  async analyzeFile(input: AnalyzeFileRequest): Promise<AnalyzeFileResult> {
    const buffer = await storage.readBuffer(input.path, input.encrypted)

    return await new Promise<AnalyzeFileResult>((resolve, reject) => {
      const worker = new Worker(createWorkerScriptUrl(), {
        workerData: {
          buffer,
          mimeType: input.mimeType,
        },
        execArgv: createWorkerExecArgv(),
      })

      worker.once('message', (message: WorkerMessage) => {
        if (message.type === 'error') {
          resolve({ ok: false, error: message.error })
          return
        }
        resolve(message.result)
      })
      worker.once('error', reject)
      worker.once('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`File analysis worker exited with code ${code}`))
        }
      })
    })
  }
}
