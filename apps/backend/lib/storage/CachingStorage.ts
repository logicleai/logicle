import { LRUCache } from 'lru-cache'
import { createHash } from 'node:crypto'
import { Storage, BaseStorage, StorageReadOptions, StorageEncryption } from './api'
import { bufferToReadableStream } from './utils'
import { logger } from '@/lib/logging'

type CachedValue = {
  bytes: Uint8Array
  contentHash: string
}

const contentHash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

export class CachingStorage extends BaseStorage {
  cache: LRUCache<string, CachedValue>
  innerStorage: Storage
  private readonly maxCacheableItemSizeBytes: number
  constructor(innerStorage: Storage, cacheSizeMb: number) {
    super()
    this.innerStorage = innerStorage
    this.cache = new LRUCache({
      maxSize: Math.round(cacheSizeMb * 1048576),
      sizeCalculation: (value) => {
        return value.bytes.length
      },
    })
    this.maxCacheableItemSizeBytes = Math.round(cacheSizeMb * 1048576)
  }

  async readStream(
    path: string,
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const shouldBypassCache =
      options?.bypassCache === true ||
      typeof options?.rangeStart === 'number' ||
      typeof options?.rangeEnd === 'number' ||
      (typeof options?.expectedSizeBytes === 'number' &&
        options.expectedSizeBytes > this.maxCacheableItemSizeBytes)
    if (shouldBypassCache) {
      return this.innerStorage.readStream(path, encrypted, options)
    }

    const cachedValue = this.cache.get(path)
    if (cachedValue) {
      const matchesExpectedContent =
        (options?.expectedSizeBytes === undefined ||
          options.expectedSizeBytes === cachedValue.bytes.length) &&
        (options?.expectedContentHash === undefined ||
          options.expectedContentHash === cachedValue.contentHash)
      if (matchesExpectedContent) {
        return bufferToReadableStream(cachedValue.bytes)
      }
      this.cache.delete(path)
    }
    const innerStream = await this.innerStorage.readStream(path, encrypted, options)
    return this.sendToCacheStream(path, innerStream, options)
  }

  supportsRangeReads(encrypted: StorageEncryption): boolean {
    return this.innerStorage.supportsRangeReads(encrypted)
  }

  writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: StorageEncryption
  ): Promise<void> {
    const cacheWritingStream = this.sendToCacheStream(path, stream)
    return this.innerStorage.writeStream(path, cacheWritingStream, encrypted)
  }

  rm(path: string): Promise<void> {
    this.cache.delete(path)
    return this.innerStorage.rm(path)
  }

  private sendToCacheStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    options?: StorageReadOptions
  ) {
    const cache = this.cache
    const maxCacheableItemSizeBytes = this.maxCacheableItemSizeBytes
    const chunks: Buffer[] = []
    let totalBytes = 0
    let shouldCache = true
    const reader = stream.getReader()
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            if (shouldCache) {
              const bytes = Buffer.concat(chunks)
              const digest = contentHash(bytes)
              if (
                (options?.expectedSizeBytes !== undefined &&
                  options.expectedSizeBytes !== bytes.length) ||
                (options?.expectedContentHash !== undefined &&
                  options.expectedContentHash !== digest)
              ) {
                controller.error(new Error(`Storage read checksum or size mismatch for ${path}`))
                return
              }
              cache.set(path, { bytes, contentHash: digest })
              logger.debug(`cache size is ${cache.calculatedSize}`)
            }
            controller.close()
            return
          }
          if (shouldCache) {
            totalBytes += value.byteLength
            if (totalBytes > maxCacheableItemSizeBytes) {
              shouldCache = false
              chunks.length = 0
            } else {
              chunks.push(Buffer.from(value))
            }
          }
          controller.enqueue(value)
        } catch (e) {
          logger.error('Readable stream failed')
          controller.error(e)
        }
      },
      cancel() {
        return reader.cancel()
      },
    })
  }
}
