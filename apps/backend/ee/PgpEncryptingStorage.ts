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
  // Coalesces concurrent S2K derivations for the same file.
  // All requests that arrive while S2K is in-flight share one Promise and get
  // the key as soon as it resolves. The entry is deleted immediately after
  // resolution so the key is never retained beyond the requests that needed it.
  private readonly pendingSessionKeys = new Map<string, Promise<openpgp.DecryptedSessionKey>>()

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

    let pending = this.pendingSessionKeys.get(path)
    if (!pending) {
      pending = (async () => {
        const release = await this.decryptSemaphore.acquire()
        try {
          const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [this.passPhrase] })
          return sk
        } finally {
          release()
          // Remove immediately: requests already awaiting this Promise still
          // receive the value, but the next request starts a fresh derivation.
          this.pendingSessionKeys.delete(path)
        }
      })()
      this.pendingSessionKeys.set(path, pending)
    }

    const sessionKey = await pending

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
      stream = await openpgp.encrypt({
        message: await openpgp.createMessage({ binary: stream }),
        passwords: [this.passPhrase],
        format: 'binary',
      })
    }
    return this.innerStorage.writeStream(path, stream, encrypted)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }
}
