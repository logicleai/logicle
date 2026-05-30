import { Storage, BaseStorage, StorageReadOptions } from '@/lib/storage/api'
import * as openpgp from 'openpgp'

// PGP S2K (String-to-Key) key derivation is synchronous JavaScript and blocks
// the event loop for ~15ms per call. Serializing decrypt initiations ensures
// the event loop is only blocked for one S2K at a time instead of N × 15ms.
class Semaphore {
  private queue: Array<() => void> = []
  private running = 0
  constructor(private readonly limit: number) {}

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const attempt = () => {
        if (this.running < this.limit) {
          this.running++
          resolve(() => {
            this.running--
            const next = this.queue.shift()
            // setImmediate yields to the macrotask queue so the event loop can
            // process pending I/O between consecutive S2K derivations.
            if (next) setImmediate(next)
          })
        } else {
          this.queue.push(attempt)
        }
      }
      attempt()
    })
  }
}

export class PgpEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  passPhrase: string
  private readonly decryptSemaphore = new Semaphore(1)
  // Session keys are deterministic per file (same S2K params + same password = same key).
  // Caching them amortises the ~15ms S2K cost across all reads of the same file:
  // 100 concurrent requests go from 100×15ms = 1500ms to 1×15ms + 99×<1ms = ~15ms.
  // Invalidated on write/delete so stale keys are never used after file replacement.
  private readonly sessionKeyCache = new Map<string, openpgp.DecryptedSessionKey>()

  constructor(innerStorage: Storage, passPhrase: string) {
    super()
    this.innerStorage = innerStorage
    this.passPhrase = passPhrase
  }

  static async create(innerStorage: Storage, passPhrase: string) {
    return new PgpEncryptingStorage(innerStorage, passPhrase)
  }

  async readStream(
    path: string,
    encrypted: boolean,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const innerStream = await this.innerStorage.readStream(path, encrypted, options)
    if (!encrypted) return innerStream

    // readMessage reads only the PGP packet headers (a few hundred bytes of I/O).
    // Keeping it outside the semaphore lets concurrent S3/disk reads happen in parallel.
    const message = await openpgp.readMessage({ binaryMessage: innerStream })

    let sessionKey = this.sessionKeyCache.get(path)
    if (!sessionKey) {
      const release = await this.decryptSemaphore.acquire()
      try {
        // Re-check after acquiring: another request may have populated the cache.
        sessionKey = this.sessionKeyCache.get(path)
        if (!sessionKey) {
          const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [this.passPhrase] })
          this.sessionKeyCache.set(path, sk)
          sessionKey = sk
        }
      } finally {
        release()
      }
    }

    const { data: clearStream } = await openpgp.decrypt({
      message,
      sessionKeys: [sessionKey as openpgp.SessionKey],
      format: 'binary',
    })
    return clearStream
  }

  async writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: boolean
  ): Promise<void> {
    if (encrypted) {
      this.sessionKeyCache.delete(path)
      stream = await openpgp.encrypt({
        message: await openpgp.createMessage({ binary: stream }),
        passwords: [this.passPhrase],
        format: 'binary',
      })
    }
    return this.innerStorage.writeStream(path, stream, encrypted)
  }

  rm(path: string): Promise<void> {
    this.sessionKeyCache.delete(path)
    return this.innerStorage.rm(path)
  }
}
