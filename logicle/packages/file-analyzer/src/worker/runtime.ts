import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import type { AnalyzerPayload } from '../analyzers'
import type { FileAnalyzerRuntime } from '../runtime'

const IDLE_TIMEOUT_MS = 30_000

type PendingRequest = {
  resolve: (payload: AnalyzerPayload) => void
  reject: (error: Error) => void
}

export class WorkerRuntime implements FileAnalyzerRuntime {
  private worker: Worker | null = null
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  private get scriptArgs(): { scriptPath: string; execArgv: string[] } {
    const isDev = process.env.NODE_ENV !== 'production'
    const currentDir = path.dirname(fileURLToPath(import.meta.url))
    // In dev, import.meta.url points to the source .ts file; run the sibling script.ts via tsx.
    // In production, tsup compiles both server.ts and the worker script; the compiled .js file
    // sits next to server.js in dist-server/.
    return {
      scriptPath: isDev
        ? path.join(currentDir, 'script.ts')
        : path.join(currentDir, 'worker-script.js'),
      execArgv: isDev ? ['--import', 'tsx'] : [],
    }
  }

  private spawnWorker(): Worker {
    const { scriptPath, execArgv } = this.scriptArgs
    const worker = new Worker(scriptPath, { execArgv })

    worker.on('message', (msg: { id: number; ok: boolean; payload?: AnalyzerPayload; error?: string }) => {
      const pending = this.pending.get(msg.id)
      if (!pending) return
      this.pending.delete(msg.id)
      if (msg.ok) {
        pending.resolve(msg.payload!)
      } else {
        pending.reject(new Error(msg.error ?? 'Worker analysis failed'))
      }
      this.scheduleIdleShutdown()
    })

    worker.on('error', (err) => {
      for (const { reject } of this.pending.values()) reject(err)
      this.pending.clear()
      this.worker = null
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        for (const { reject } of this.pending.values()) {
          reject(new Error(`Worker exited with code ${code}`))
        }
        this.pending.clear()
      }
      this.worker = null
    })

    return worker
  }

  private scheduleIdleShutdown() {
    if (this.pending.size > 0) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.pending.size === 0 && this.worker) {
        this.worker.terminate()
        this.worker = null
      }
    }, IDLE_TIMEOUT_MS)
  }

  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    if (!this.worker) {
      this.worker = this.spawnWorker()
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      // Transfer the buffer to avoid copying
      this.worker!.postMessage({ id, buffer, mimeType }, [buffer.buffer as ArrayBuffer])
    })
  }
}
