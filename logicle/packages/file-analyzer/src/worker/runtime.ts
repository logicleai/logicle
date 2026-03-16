import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import type { AnalyzerPayload } from '../analyzers'
import type { FileAnalyzerRuntime } from '../runtime'

export interface WorkerLogger {
  info(message: string, meta?: object): void
  warn(message: string, meta?: object): void
  error(message: string, meta?: object): void
}

type PendingRequest = {
  resolve: (payload: AnalyzerPayload) => void
  reject: (error: Error) => void
}

export class WorkerRuntime implements FileAnalyzerRuntime {
  private worker: Worker
  private pending = new Map<number, PendingRequest>()
  private nextId = 1

  constructor(private logger?: WorkerLogger) {
    const isDev = process.env.NODE_ENV !== 'production'
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    // In dev, import.meta.url points to the source .ts file; run the sibling script.ts via tsx.
    // In production, tsup compiles both server.ts and the worker script; the compiled .js file
    // sits next to server.js in dist-server/.
    const scriptPath = isDev
      ? path.join(currentDir, 'script.ts')
      : path.join(currentDir, 'worker-script.js')
    const execArgv = isDev ? ['--import', 'tsx'] : []

    this.worker = new Worker(scriptPath, { execArgv, name: 'file-analyzer' })

    this.worker.on('message', (msg: { type?: 'log'; id: number; ok: boolean; level?: 'info' | 'warn' | 'error'; message?: string; payload?: AnalyzerPayload; error?: string }) => {
      if (msg.type === 'log') {
        const { type: _, id: __, ok: ___, level = 'info', message = '', ...meta } = msg
        this.logger?.[level](message, meta)
        return
      }
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)
      if (msg.ok) {
        pending.resolve(msg.payload!)
      } else {
        pending.reject(new Error(msg.error ?? 'Worker analysis failed'))
      }
    })

    this.worker.on('error', (err) => {
      for (const { reject } of this.pending.values()) reject(err)
      this.pending.clear()
    })

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        for (const { reject } of this.pending.values()) {
          reject(new Error(`Worker exited with code ${code}`))
        }
        this.pending.clear()
      }
    })
  }

  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      // Transfer the buffer to avoid copying
      this.worker.postMessage({ id, buffer, mimeType }, [buffer.buffer as ArrayBuffer])
    })
  }
}
