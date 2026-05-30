import { Storage, BaseStorage, StorageReadOptions } from '@/lib/storage/api'
import * as openpgp from 'openpgp'
import type { PgpS2kWorkerRuntime } from './pgp-s2k-worker/runtime'

// Injected at bootstrap so the EE module doesn't need to construct the worker itself.
let s2kWorker: PgpS2kWorkerRuntime | null = null

export function setPgpS2kWorker(worker: PgpS2kWorkerRuntime) {
  s2kWorker = worker
}

export class PgpEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  passPhrase: string

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

    // Read the first chunk from the storage stream. The SKESK (session-key
    // encrypted session key) packet lives in the first ~50 bytes of a PGP
    // message, well within any single storage chunk.
    const initialReader = innerStream.getReader()
    const { value: firstChunk, done } = await initialReader.read()
    initialReader.releaseLock()

    if (!firstChunk || done) throw new Error(`PGP stream for ${path} is empty`)

    // Derive the session key in the worker thread — S2K is synchronous JavaScript
    // that blocks for ~15ms; running it off the main thread keeps the event loop free
    // regardless of how many concurrent requests arrive.
    const worker = s2kWorker
    if (!worker) throw new Error('PGP S2K worker is not initialised')
    const sessionKey = await worker.deriveSessionKey(
      firstChunk.slice(0, Math.min(512, firstChunk.length)),
      this.passPhrase
    )

    // Reconstruct the full stream by prepending the already-read first chunk.
    const restReader = innerStream.getReader()
    let firstSent = false
    const fullStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!firstSent) {
          firstSent = true
          controller.enqueue(firstChunk)
          return
        }
        const { done, value } = await restReader.read()
        if (done) controller.close()
        else controller.enqueue(value)
      },
      cancel() {
        return restReader.cancel()
      },
    })

    const message = await openpgp.readMessage({ binaryMessage: fullStream })
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
