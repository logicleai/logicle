import { LRUCache } from 'lru-cache'
import { Storage, BaseStorage } from './api'
import { bufferToReadableStream } from './utils'
import { logger } from '../logging'

export class CachingStorage extends BaseStorage {
  cache: LRUCache<string, Uint8Array>
  innerStorage: Storage
  constructor(innerStorage: Storage, cacheSizeMb: number) {
    super()
    this.innerStorage = innerStorage
    this.cache = new LRUCache({
      maxSize: Math.round(cacheSizeMb * 1048576),
      sizeCalculation: (value) => {
        return value.length
      },
    })
  }

  async readStream(path: string, encrypted: boolean): Promise<ReadableStream<Uint8Array>> {
    const cachedValue = this.cache.get(path)
    if (cachedValue) {
      return bufferToReadableStream(cachedValue)
    }
    const innerStream = await this.innerStorage.readStream(path, encrypted)
    return this.sendToCacheStream(path, innerStream)
  }

  writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    size: number,
    encrypted: boolean
  ): Promise<void> {
    const cacheWritingStream = this.sendToCacheStream(path, stream)
    return this.innerStorage.writeStream(path, cacheWritingStream, size, encrypted)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }

  private sendToCacheStream(path: string, stream: ReadableStream<Uint8Array>) {
    const cache = this.cache
    const chunks: Buffer[] = []
    return new ReadableStream({
      start(controller) {
        const reader = stream.getReader()

        async function push() {
          try {
            const { done, value } = await reader.read()
            if (done) {
              controller.close()
              cache.set(path, Buffer.concat(chunks))
              logger.info(`cache size is ${cache.calculatedSize}`)
              return
            }
            chunks.push(Buffer.from(value)) // Collect data for Buffer
            controller.enqueue(value) // Pass data downstream
            await push() // Read the next chunk
          } catch (e) {
            logger.error('Readable stream failed')
            controller.error(e)
          }
        }
        void push()
      },
    })
  }
}
