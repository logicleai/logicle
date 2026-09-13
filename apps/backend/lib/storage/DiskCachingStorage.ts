import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { logger } from '@/lib/logging'
import { BaseStorage, Storage, StorageEncryption, StorageReadOptions } from './api'
import { bufferToReadableStream } from './utils'

const MAGIC = Buffer.from('LOGICLE-DISK-CACHE-V1', 'utf8')
const VERSION = 1
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

type CacheHeader = {
  version: number
  pathHash: string
  size: number
  contentHash: string
  storedAt: number
  encrypted: boolean
  iv?: string
  authTag?: string
}

const hash = (value: Uint8Array | string): string =>
  createHash('sha256').update(value).digest('hex')

const deriveKey = (passPhrase: string): Buffer => createHash('sha256').update(passPhrase).digest()

const isHeader = (value: unknown): value is CacheHeader => {
  if (!value || typeof value !== 'object') return false
  const header = value as Record<string, unknown>
  return (
    header.version === VERSION &&
    typeof header.pathHash === 'string' &&
    typeof header.size === 'number' &&
    Number.isSafeInteger(header.size) &&
    header.size >= 0 &&
    typeof header.contentHash === 'string' &&
    typeof header.storedAt === 'number' &&
    typeof header.encrypted === 'boolean'
  )
}

/**
 * Optional persistent cache for complete, decrypted storage reads.
 *
 * It is intentionally a storage wrapper rather than part of the object-store implementation:
 * all backends (filesystem, S3 and the replay backend) get the same behavior. The wrapper sits
 * outside the file-encryption wrappers, so the local cache is encrypted when a cache key is
 * configured even if the primary storage itself is not encrypted.
 */
export class DiskCachingStorage extends BaseStorage {
  private readonly maxBytes: number
  private readonly maxCacheableItemSizeBytes: number
  private readonly ttlMs: number
  private readonly encryptionKey?: Buffer
  private directoryReady: Promise<void> | undefined

  constructor(
    private readonly innerStorage: Storage,
    private readonly directory: string,
    cacheSizeInMb: number,
    ttlMs: number,
    encryptionPassPhrase?: string
  ) {
    super()
    this.maxBytes = Math.max(0, Math.round(cacheSizeInMb * 1048576))
    this.maxCacheableItemSizeBytes = this.maxBytes
    this.ttlMs = Math.max(0, ttlMs)
    this.encryptionKey = encryptionPassPhrase ? deriveKey(encryptionPassPhrase) : undefined
  }

  async readStream(
    filePath: string,
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const shouldBypassCache =
      options?.bypassCache === true ||
      typeof options?.rangeStart === 'number' ||
      typeof options?.rangeEnd === 'number' ||
      (typeof options?.expectedSizeBytes === 'number' &&
        options.expectedSizeBytes > this.maxCacheableItemSizeBytes)
    if (shouldBypassCache || this.maxBytes === 0) {
      return this.innerStorage.readStream(filePath, encrypted, options)
    }

    const cached = await this.readCached(filePath, options)
    if (cached) {
      return bufferToReadableStream(cached)
    }

    const innerStream = await this.innerStorage.readStream(filePath, encrypted, options)
    return this.cacheReadStream(filePath, innerStream, options)
  }

  supportsRangeReads(encrypted: StorageEncryption): boolean {
    return this.innerStorage.supportsRangeReads(encrypted)
  }

  async writeStream(
    filePath: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: StorageEncryption
  ): Promise<void> {
    if (this.maxBytes === 0) {
      await this.innerStorage.writeStream(filePath, stream, encrypted)
      return
    }

    const chunks: Buffer[] = []
    let totalBytes = 0
    let cacheable = true
    const reader = stream.getReader()
    const maxCacheableItemSizeBytes = this.maxCacheableItemSizeBytes
    const forwardingStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          if (cacheable) {
            totalBytes += value.byteLength
            if (totalBytes > maxCacheableItemSizeBytes) {
              cacheable = false
              chunks.length = 0
            } else {
              chunks.push(Buffer.from(value))
            }
          }
          controller.enqueue(value)
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        return reader.cancel()
      },
    })

    await this.innerStorage.writeStream(filePath, forwardingStream, encrypted)
    if (cacheable) {
      await this.writeCached(filePath, Buffer.concat(chunks))
    }
  }

  async rm(filePath: string): Promise<void> {
    await this.innerStorage.rm(filePath)
    await this.invalidate(filePath)
  }

  private async readCached(
    filePath: string,
    options?: StorageReadOptions
  ): Promise<Buffer | undefined> {
    const cachePath = this.cachePath(filePath)
    try {
      await this.ensureDirectory()
      const bytes = await readFile(cachePath)
      if (bytes.length < MAGIC.length + 4 || !bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
        return this.invalidateCached(cachePath)
      }
      const headerLength = bytes.readUInt32BE(MAGIC.length)
      const headerStart = MAGIC.length + 4
      const payloadStart = headerStart + headerLength
      if (headerLength <= 0 || payloadStart > bytes.length) {
        return this.invalidateCached(cachePath)
      }
      const headerValue: unknown = JSON.parse(
        bytes.subarray(headerStart, payloadStart).toString('utf8')
      )
      if (!isHeader(headerValue) || headerValue.pathHash !== hash(filePath)) {
        return this.invalidateCached(cachePath)
      }
      if (headerValue.encrypted !== Boolean(this.encryptionKey)) {
        return this.invalidateCached(cachePath)
      }
      if (this.ttlMs > 0 && Date.now() - headerValue.storedAt > this.ttlMs) {
        return this.invalidateCached(cachePath)
      }
      if (
        (typeof options?.expectedSizeBytes === 'number' &&
          options.expectedSizeBytes !== headerValue.size) ||
        (options?.expectedContentHash && options.expectedContentHash !== headerValue.contentHash)
      ) {
        return this.invalidateCached(cachePath)
      }

      const payload = bytes.subarray(payloadStart)
      const clear = this.decryptPayload(headerValue, payload, filePath)
      if (
        clear.length !== headerValue.size ||
        hash(clear) !== headerValue.contentHash ||
        (typeof options?.expectedSizeBytes === 'number' &&
          clear.length !== options.expectedSizeBytes) ||
        (options?.expectedContentHash && hash(clear) !== options.expectedContentHash)
      ) {
        return this.invalidateCached(cachePath)
      }
      await utimes(cachePath, new Date(), new Date())
      return clear
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      logger.warn('Disk storage cache read failed; treating entry as a miss', {
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      await this.invalidateCached(cachePath)
      return undefined
    }
  }

  private cacheReadStream(
    filePath: string,
    stream: ReadableStream<Uint8Array>,
    options?: StorageReadOptions
  ): ReadableStream<Uint8Array> {
    const reader = stream.getReader()
    const chunks: Buffer[] = []
    let totalBytes = 0
    let cacheable = true
    const maxBytes = this.maxCacheableItemSizeBytes
    const writeCached = (bytes: Buffer) => this.writeCached(filePath, bytes)
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            if (
              typeof options?.expectedSizeBytes === 'number' &&
              totalBytes !== options.expectedSizeBytes
            ) {
              controller.error(
                new Error(
                  `Storage read size mismatch for ${filePath}: expected ${options.expectedSizeBytes}, got ${totalBytes}`
                )
              )
              return
            }
            const complete = Buffer.concat(chunks)
            if (cacheable) {
              if (options?.expectedContentHash && hash(complete) !== options.expectedContentHash) {
                controller.error(new Error(`Storage read checksum mismatch for ${filePath}`))
                return
              }
              await writeCached(complete)
            }
            controller.close()
            return
          }
          totalBytes += value.byteLength
          if (cacheable) {
            if (totalBytes > maxBytes) {
              cacheable = false
              chunks.length = 0
            } else {
              chunks.push(Buffer.from(value))
            }
          }
          controller.enqueue(value)
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        return reader.cancel()
      },
    })
  }

  private async writeCached(filePath: string, clear: Buffer): Promise<void> {
    if (clear.length > this.maxCacheableItemSizeBytes) return
    try {
      await this.ensureDirectory()
      const contentHash = hash(clear)
      const pathHash = hash(filePath)
      let payload = clear
      const header: CacheHeader = {
        version: VERSION,
        pathHash,
        size: clear.length,
        contentHash,
        storedAt: Date.now(),
        encrypted: Boolean(this.encryptionKey),
      }
      if (this.encryptionKey) {
        const iv = randomBytes(IV_BYTES)
        const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv)
        cipher.setAAD(this.additionalData(header))
        payload = Buffer.concat([cipher.update(clear), cipher.final()])
        header.iv = iv.toString('base64')
        header.authTag = cipher.getAuthTag().toString('base64')
      }
      const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
      const envelope = Buffer.alloc(MAGIC.length + 4 + headerBytes.length + payload.length)
      MAGIC.copy(envelope, 0)
      envelope.writeUInt32BE(headerBytes.length, MAGIC.length)
      headerBytes.copy(envelope, MAGIC.length + 4)
      payload.copy(envelope, MAGIC.length + 4 + headerBytes.length)

      const cachePath = this.cachePath(filePath)
      const temporaryPath = `${cachePath}.${randomUUID()}.tmp`
      await writeFile(temporaryPath, envelope, { mode: 0o600 })
      await rename(temporaryPath, cachePath)
      await this.prune()
    } catch (error) {
      logger.warn('Disk storage cache write failed; continuing without persistent cache', {
        path: filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private decryptPayload(header: CacheHeader, payload: Buffer, filePath: string): Buffer {
    if (!header.encrypted) {
      if (header.iv || header.authTag) throw new Error('Invalid unencrypted cache header')
      return payload
    }
    if (!this.encryptionKey || !header.iv || !header.authTag) {
      throw new Error('Encrypted cache entry cannot be opened with the configured key')
    }
    const decipher = createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(header.iv, 'base64')
    )
    decipher.setAAD(this.additionalData(header))
    decipher.setAuthTag(Buffer.from(header.authTag, 'base64'))
    try {
      return Buffer.concat([decipher.update(payload), decipher.final()])
    } catch {
      throw new Error(`Encrypted cache authentication failed for ${filePath}`)
    }
  }

  private additionalData(header: CacheHeader): Buffer {
    return Buffer.from(
      `${header.version}\u0000${header.pathHash}\u0000${header.size}\u0000${header.contentHash}`,
      'utf8'
    )
  }

  private cachePath(filePath: string): string {
    return path.join(this.directory, `${hash(filePath)}.cache`)
  }

  private async ensureDirectory(): Promise<void> {
    this.directoryReady ??= mkdir(this.directory, { recursive: true, mode: 0o700 }).then(
      () => undefined
    )
    await this.directoryReady
  }

  private async invalidate(filePath: string): Promise<undefined> {
    await rm(filePath, { force: true }).catch(() => undefined)
    return undefined
  }

  private async invalidateCached(filePath: string): Promise<undefined> {
    return this.invalidate(filePath)
  }

  private async prune(): Promise<void> {
    const entries = await readdir(this.directory, { withFileTypes: true })
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.cache'))
        .map(async (entry) => {
          const filePath = path.join(this.directory, entry.name)
          const fileStat = await stat(filePath)
          return { filePath, size: fileStat.size, mtimeMs: fileStat.mtimeMs }
        })
    )
    let total = files.reduce((sum, file) => sum + file.size, 0)
    if (total <= this.maxBytes) return
    files.sort((left, right) => left.mtimeMs - right.mtimeMs)
    for (const file of files) {
      if (total <= this.maxBytes) break
      await rm(file.filePath, { force: true })
      total -= file.size
    }
  }
}
