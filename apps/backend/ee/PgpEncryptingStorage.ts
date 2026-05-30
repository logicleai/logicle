import { Storage, BaseStorage, StorageReadOptions } from '@/lib/storage/api'
import * as openpgp from 'openpgp'
import type { PgpS2kWorkerRuntime } from './pgp-s2k-worker/runtime'
import { streamingIteratedS2kProduceKey } from './pgp-s2k-worker/streaming-s2k'

// Injected at bootstrap so the EE module doesn't need to construct the worker itself.
let s2kWorker: PgpS2kWorkerRuntime | null = null

export function setPgpS2kWorker(worker: PgpS2kWorkerRuntime) {
  s2kWorker = worker
}

// Direct (same-thread) fallback used when the worker is not running (e.g. tests).
async function deriveSessionKeyDirect(
  headerBytes: Uint8Array,
  passphrase: string
): Promise<openpgp.DecryptedSessionKey> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(headerBytes)
      // Intentionally do NOT close — same reasoning as the worker script.
    },
  })
  const message = await openpgp.readMessage({ binaryMessage: stream })

  for (const pkt of message.packets.filterByTag(openpgp.enums.packet.symEncryptedSessionKey)) {
    const s2k = (pkt as any).s2k
    if (s2k?.type === 'iterated') {
      const { algorithm, salt, c } = s2k
      s2k.produceKey = (pass: string, keySizeBytes: number): Promise<Uint8Array> =>
        Promise.resolve(streamingIteratedS2kProduceKey(algorithm, salt, c, pass, keySizeBytes))
    }
  }

  const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [passphrase] })
  return sk
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

    // Derive the session key. The worker offloads the ~4ms S2K computation off
    // the main thread; fall back to a direct call when the worker is not running
    // (e.g. in tests or standalone scripts).
    const headerBytes = firstChunk.slice(0, Math.min(512, firstChunk.length))
    const sessionKey = s2kWorker
      ? await s2kWorker.deriveSessionKey(headerBytes, this.passPhrase)
      : await deriveSessionKeyDirect(headerBytes, this.passPhrase)

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
