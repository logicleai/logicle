import { BaseStorage } from './api'
import { bufferToReadableStream } from './utils'

export class MemoryStorage extends BaseStorage {
  map: Record<string, Uint8Array> = {}

  async rm(path: string) {
    delete this.map[path]
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    return bufferToReadableStream(this.map[path])
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
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
