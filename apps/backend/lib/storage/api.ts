import { bufferToReadableStream, collectStreamToBuffer } from './utils'

export interface Storage {
  writeStream(path: string, stream: ReadableStream<Uint8Array>, encrypted: boolean): Promise<void>
  writeBuffer(path: string, buffer: Uint8Array, encrypted: boolean): Promise<void>
  rm(path: string): Promise<void>
  readStream(path: string, encrypted: boolean): Promise<ReadableStream<Uint8Array>>
  readBuffer(path: string, encrypted: boolean): Promise<Buffer>
}

export abstract class BaseStorage implements Storage {
  abstract readStream(path: string, encrypted: boolean): Promise<ReadableStream<Uint8Array>>
  abstract writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: boolean
  ): Promise<void>

  async readBuffer(path: string, encrypted: boolean): Promise<Buffer> {
    return collectStreamToBuffer(await this.readStream(path, encrypted))
  }

  async writeBuffer(path: string, buffer: Uint8Array, encrypted: boolean) {
    await this.writeStream(path, bufferToReadableStream(buffer), encrypted)
  }
  abstract rm(path: string): Promise<void>
}
