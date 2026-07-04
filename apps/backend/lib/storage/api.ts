import { bufferToReadableStream, collectStreamToBuffer } from './utils'

export type StorageEncryption = null | 'pgp' | 'aead'

export interface StorageReadOptions {
  expectedSizeBytes?: number
  bypassCache?: boolean
  rangeStart?: number
  rangeEnd?: number
}

export interface Storage {
  writeStream(path: string, stream: ReadableStream<Uint8Array>, encrypted: StorageEncryption): Promise<void>
  writeBuffer(path: string, buffer: Uint8Array, encrypted: StorageEncryption): Promise<void>
  rm(path: string): Promise<void>
  supportsRangeReads(encrypted: StorageEncryption): boolean
  readStream(
    path: string,
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>>
  readBuffer(path: string, encrypted: StorageEncryption): Promise<Buffer>
}

export abstract class BaseStorage implements Storage {
  supportsRangeReads(_encrypted: StorageEncryption): boolean {
    return true
  }

  abstract readStream(
    path: string,
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>>
  abstract writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: StorageEncryption
  ): Promise<void>

  async readBuffer(path: string, encrypted: StorageEncryption): Promise<Buffer> {
    return collectStreamToBuffer(await this.readStream(path, encrypted))
  }

  async writeBuffer(path: string, buffer: Uint8Array, encrypted: StorageEncryption) {
    await this.writeStream(path, bufferToReadableStream(buffer), encrypted)
  }
  abstract rm(path: string): Promise<void>
}
