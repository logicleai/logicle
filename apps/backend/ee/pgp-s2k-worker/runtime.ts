import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import type * as openpgp from 'openpgp'

type PendingRequest = {
  resolve: (key: openpgp.DecryptedSessionKey) => void
  reject: (error: Error) => void
}

export class PgpS2kWorkerRuntime {
  private worker: Worker
  private pending = new Map<number, PendingRequest>()
  private nextId = 1

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptPath = this.resolveScriptPath(isDev)
    const execArgv = isDev ? ['--import', 'tsx'] : []

    this.worker = new Worker(scriptPath, { execArgv, name: 'pgp-s2k' })

    this.worker.on(
      'message',
      (msg: { id: number; ok: boolean; algorithm?: string; data?: number[]; error?: string }) => {
        const pending = this.pending.get(msg.id)
        if (!pending) return
        this.pending.delete(msg.id)
        if (msg.ok) {
          pending.resolve({
            algorithm: msg.algorithm as openpgp.DecryptedSessionKey['algorithm'],
            data: new Uint8Array(msg.data!),
          })
        } else {
          pending.reject(new Error(msg.error ?? 'PGP S2K worker failed'))
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
          reject(new Error(`PGP S2K worker exited with code ${code}`))
        }
        this.pending.clear()
      }
    })
  }

  private resolveScriptPath(isDev: boolean): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url))

    if (!isDev) {
      return path.join(currentDir, 'pgp-s2k-script.js')
    }

    const candidates = [
      path.join(currentDir, 'script.ts'),
      path.resolve(process.cwd(), 'apps/backend/ee/pgp-s2k-worker/script.ts'),
    ]
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }

    throw new Error(`Unable to locate PGP S2K worker script. Tried: ${candidates.join(', ')}`)
  }

  deriveSessionKey(headerBytes: Uint8Array, passphrase: string): Promise<openpgp.DecryptedSessionKey> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, headerBytes: Array.from(headerBytes), passphrase })
    })
  }
}
