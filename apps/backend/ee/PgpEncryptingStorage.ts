import { Storage, BaseStorage, StorageReadOptions, StorageEncryption } from '@/lib/storage/api'
import * as openpgp from 'openpgp'
import { LRUCache } from 'lru-cache'
import type { PgpS2kWorkerRuntime } from './pgp-s2k-worker/runtime'
import { patchSkeskPackets } from './pgp-s2k-worker/streaming-s2k'

// Injected at bootstrap so the EE module doesn't need to construct the worker itself.
let s2kWorker: PgpS2kWorkerRuntime | null = null

export function setPgpS2kWorker(worker: PgpS2kWorkerRuntime) {
  s2kWorker = worker
}

function isPgp(encrypted: StorageEncryption): boolean {
  return encrypted === 'pgp'
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

  patchSkeskPackets(message)

  const [sk] = await openpgp.decryptSessionKeys({ message, passwords: [passphrase] })
  return sk
}

// Minimum bytes needed to contain the PGP SKESK header (v4 iterated S2K ≈ 18B)
// plus the start of the following SEIPD packet header.
const MIN_HEADER_BYTES = 64
const MAX_HEADER_BYTES = 512

export class PgpEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  passPhrase: string

  // Session keys are deterministic for a given (path, passphrase) pair and
  // expensive to derive (~4ms per S2K at count=224). Cache the derivation
  // promise so concurrent requests for the same file share one S2K task.
  private sessionKeyCache = new LRUCache<string, Promise<openpgp.DecryptedSessionKey>>({
    max: 1000,
    ttl: 60 * 60 * 1000,
  })

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
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    if (!isPgp(encrypted)) return this.innerStorage.readStream(path, encrypted, options)
    if (typeof options?.rangeStart === 'number' || typeof options?.rangeEnd === 'number') {
      throw new Error('Legacy PGP encrypted blobs do not support range reads')
    }

    const innerStream = await this.innerStorage.readStream(path, encrypted, options)
    // Accumulate chunks until we have enough bytes to parse the SKESK header.
    // Storage backends may return arbitrarily small initial chunks (e.g. an
    // in-memory stream that yields one byte at a time), so we cannot assume
    // the first chunk alone contains the full header.
    const bufferedChunks: Uint8Array[] = []
    let bufferedSize = 0

    const initialReader = innerStream.getReader()
    while (bufferedSize < MIN_HEADER_BYTES) {
      const { value, done } = await initialReader.read()
      if (done) break
      bufferedChunks.push(value)
      bufferedSize += value.length
    }
    initialReader.releaseLock()

    if (bufferedSize === 0) throw new Error(`PGP stream for ${path} is empty`)

    if (bufferedSize < MIN_HEADER_BYTES) {
      throw new Error(
        `PGP stream for ${path} ended before enough header bytes were available (${bufferedSize} < ${MIN_HEADER_BYTES})`
      )
    }

    // Build a header slice (up to MAX_HEADER_BYTES) from the buffered chunks.
    const headerBuf = new Uint8Array(Math.min(bufferedSize, MAX_HEADER_BYTES))
    let off = 0
    for (const chunk of bufferedChunks) {
      if (off >= headerBuf.length) break
      const n = Math.min(chunk.length, headerBuf.length - off)
      headerBuf.set(chunk.subarray(0, n), off)
      off += n
    }

    // Session key derivation — cached by path (each blob has a fixed SKESK).
    // Cache in-flight promises to deduplicate concurrent work.
    let sessionKeyPromise = this.sessionKeyCache.get(path)
    if (!sessionKeyPromise) {
      sessionKeyPromise = (s2kWorker
        ? s2kWorker.deriveSessionKey(headerBuf, this.passPhrase)
        : deriveSessionKeyDirect(headerBuf, this.passPhrase)
      ).catch((error) => {
        console.error('[PgpEncryptingStorage] readStream: session key derivation failed', {
          path,
          error: error instanceof Error ? error.message : String(error),
        })
        this.sessionKeyCache.delete(path)
        throw error
      })
      this.sessionKeyCache.set(path, sessionKeyPromise)
    }
    const sessionKey = await sessionKeyPromise

    // Reconstruct the full stream: replay buffered chunks, then continue reading.
    const restReader = innerStream.getReader()
    let chunkIdx = 0
    const fullStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunkIdx < bufferedChunks.length) {
          controller.enqueue(bufferedChunks[chunkIdx++])
          return
        }
        return restReader.read().then(({ done, value }) => {
          if (done) controller.close()
          else controller.enqueue(value)
        })
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
    encrypted: StorageEncryption
  ): Promise<void> {
    if (isPgp(encrypted)) {
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
