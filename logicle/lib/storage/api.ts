import { bufferToReadableStream, collectStreamToBuffer } from './utils'

export interface Storage {
  writeStream(path: string, stream: ReadableStream<Uint8Array>, size: number): Promise<void>
  writeBuffer(path: string, buffer: Uint8Array): Promise<void>
  rm(path: string): Promise<void>
  readStream(path: string): Promise<ReadableStream<Uint8Array>>
  readBuffer(path: string): Promise<Buffer>
}

export abstract class BaseStorage implements Storage {
  abstract readStream(path: string): Promise<ReadableStream<Uint8Array>>
  abstract writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    size: number
  ): Promise<void>

  async readBuffer(path: string): Promise<Buffer> {
    return collectStreamToBuffer(await this.readStream(path))
  }

  async writeBuffer(path: string, buffer: Uint8Array) {
    await this.writeStream(path, bufferToReadableStream(buffer), buffer.length)
  }
  abstract rm(path: string): Promise<void>
}
