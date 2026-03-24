import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

type TiktokenStrategy = 'cl100k_base' | 'o200k_base'

type PendingRequest = {
  resolve: (count: number) => void
  reject: (error: Error) => void
}

export class TokenizerWorkerRuntime {
  private worker: Worker
  private pending = new Map<number, PendingRequest>()
  private nextId = 1

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptPath = this.resolveScriptPath(isDev)
    const execArgv = isDev ? ['--import', 'tsx'] : []

    this.worker = new Worker(scriptPath, { execArgv, name: 'tokenizer' })

    this.worker.on(
      'message',
      (msg: { id: number; ok: boolean; count?: number; error?: string }) => {
        const pending = this.pending.get(msg.id)
        if (!pending) return
        this.pending.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.count!)
        } else {
          pending.reject(new Error(msg.error ?? 'Tokenizer worker failed'))
        }
      }
    )

    this.worker.on('error', (err) => {
      for (const { reject } of this.pending.values()) reject(err)
      this.pending.clear()
    })

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        for (const { reject } of this.pending.values()) {
          reject(new Error(`Tokenizer worker exited with code ${code}`))
        }
        this.pending.clear()
      }
    })
  }

  private resolveScriptPath(isDev: boolean): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))

    if (!isDev) {
      return path.join(currentDir, 'tokenizer-script.js')
    }

    const candidates = [
      path.join(currentDir, 'script.ts'),
      path.resolve(process.cwd(), 'apps/backend/lib/chat/tokenizer-worker/script.ts'),
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }

    throw new Error(
      `Unable to locate tokenizer worker script. Tried: ${candidates.join(', ')}`
    )
  }

  countText(tokenizer: TiktokenStrategy, text: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, tokenizer, text })
    })
  }
}
