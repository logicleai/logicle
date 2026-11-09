import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
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
  timer: ReturnType<typeof setTimeout>
}

type WorkerState = {
  worker: Worker
  pending: Map<number, PendingRequest>
  failure?: Error
}

const defaultTimeoutMs = 300_000

export class WorkerRuntime implements FileAnalyzerRuntime {
  private state?: WorkerState
  private nextId = 1

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: object): void {
    this.logger?.[level](message, meta)
  }

  private resolveWorkerScriptPath(isDev: boolean): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))

    if (!isDev) {
      return path.join(currentDir, 'worker-script.js')
    }

    const candidates = [
      path.join(currentDir, 'script.ts'),
      path.resolve(process.cwd(), 'packages/file-analyzer/src/worker/script.ts'),
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }

    throw new Error(`Unable to locate file analyzer worker script. Tried: ${candidates.join(', ')}`)
  }

  constructor(
    private logger?: WorkerLogger,
    private readonly timeoutMs = defaultTimeoutMs
  ) {
    // Node clamps invalid or overflowing timer delays to 1 ms.
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
      this.log('warn', `Invalid FILE_ANALYSIS_TIMEOUT_MS; using default ${defaultTimeoutMs} ms`, {
        timeoutMs: String(timeoutMs),
      })
      this.timeoutMs = defaultTimeoutMs
    }
    this.startWorker()
  }

  private startWorker(): WorkerState {
    const isDev = process.env.NODE_ENV !== 'production'
    // In dev, import.meta.url points to the source .ts file; run the sibling script.ts via tsx.
    // In production, tsup compiles both server.ts and the worker script; the compiled .js file
    // sits next to server.js in dist-server/.
    const scriptPath = this.resolveWorkerScriptPath(isDev)
    const execArgv = isDev ? ['--import', 'tsx'] : []

    this.log('info', 'Starting file analyzer worker', {
      isDev,
      scriptPath,
      timeoutMs: this.timeoutMs,
    })
    const state: WorkerState = {
      worker: new Worker(scriptPath, { execArgv, name: 'file-analyzer' }),
      pending: new Map(),
    }
    this.state = state

    state.worker.on(
      'message',
      (msg: {
        type?: 'log'
        id: number
        ok: boolean
        level?: 'info' | 'warn' | 'error'
        message?: string
        payload?: AnalyzerPayload
        error?: string
      }) => {
        // Ignore results arriving after a failure while the worker is terminating.
        if (state.failure) return
        if (msg.type === 'log') {
          const { type: _, id: __, ok: ___, level = 'info', message = '', ...meta } = msg
          this.logger?.[level](message, meta)
          return
        }
        const pending = state.pending.get(msg.id)
        if (!pending) return
        state.pending.delete(msg.id)
        clearTimeout(pending.timer)
        if (msg.ok) {
          pending.resolve(msg.payload!)
        } else {
          pending.reject(new Error(msg.error ?? 'Worker analysis failed'))
        }
      }
    )

    state.worker.on('error', (err) => {
      state.failure ??= err
      this.log('error', 'File analyzer worker error', {
        error: err instanceof Error ? err.message : String(err),
      })
    })

    state.worker.on('exit', (code) => {
      this.state = undefined
      this.log('error', 'File analyzer worker exited unexpectedly', { code })
      const error = state.failure ?? new Error(`Worker exited with code ${code}`)
      // Reject unfinished requests only after the worker has stopped, so the
      // queue cannot advance while it is still terminating.
      for (const { reject, timer } of state.pending.values()) {
        clearTimeout(timer)
        reject(error)
      }
      state.pending.clear()
    })
    return state
  }

  analyzeBuffer(buffer: Buffer, mimeType: string): Promise<AnalyzerPayload> {
    return new Promise((resolve, reject) => {
      // Replace an exited worker only when another file needs analysis. A bad
      // startup cannot cause an unattended restart loop.
      const state = this.state ?? this.startWorker()
      if (state.failure) {
        reject(state.failure)
        return
      }
      const id = this.nextId++
      // Extract a standalone ArrayBuffer slice — Node.js small Buffers are backed by
      // a shared pool whose .buffer cannot be transferred.
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
      ) as ArrayBuffer
      const timer = setTimeout(() => {
        if (state.failure || !state.pending.has(id)) return
        state.failure = new Error(`File analysis timed out after ${this.timeoutMs} ms`)
        this.log('error', 'File analyzer worker timed out', {
          id,
          mimeType,
          timeoutMs: this.timeoutMs,
        })
        // Stop the worker; the exit handler will reject the request.
        void state.worker.terminate().catch((error) => {
          this.log('error', 'Failed to terminate file analyzer worker', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }, this.timeoutMs)
      state.pending.set(id, { resolve, reject, timer })
      try {
        state.worker.postMessage({ id, buffer: arrayBuffer, mimeType }, [arrayBuffer])
      } catch (error) {
        state.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}
