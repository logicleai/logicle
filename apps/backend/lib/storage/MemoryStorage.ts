import { BaseStorage } from './api'
import type { StorageEncryption, StorageReadOptions } from './api'
import { bufferToReadableStream } from './utils'

export class MemoryStorage extends BaseStorage {
  map: Record<string, Uint8Array> = {}

  async rm(path: string) {
    delete this.map[path]
  }

  supportsRangeReads(_encryption: StorageEncryption): boolean {
    return true
  }

  async readStream(
    path: string,
    _encryption: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const buffer = this.map[path]
    if (typeof options?.rangeStart === 'number' || typeof options?.rangeEnd === 'number') {
      const start = options.rangeStart ?? 0
      const end = options.rangeEnd === undefined ? buffer.length : options.rangeEnd + 1
      return bufferToReadableStream(buffer.subarray(start, end))
    }
    return bufferToReadableStream(buffer)
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>, _encryption: StorageEncryption) {
    const chunks: Buffer[] = []
    const reader = stream.getReader()
    for (;;) {
      const data = await reader.read()
      if (data.done) {
        break
      }
      chunks.push(Buffer.from(data.value))
    }
    this.map[path] = Buffer.concat(chunks)
  }
}
