import { logger } from '@/lib/logging'
import { Storage, BaseStorage } from '@/lib/storage/api'
import * as openpgp from 'openpgp'

const concatenate = (chunks: Uint8Array[]) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const concatenatedBuffer = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    concatenatedBuffer.set(chunk, offset)
    offset += chunk.length
  }
  return concatenatedBuffer
}

const rollIv = (iv: Uint8Array, increment: number = 1): void => {
  if (increment < 0) {
    throw new Error('Increment must be non-negative')
  }

  const view = new DataView(iv.buffer, iv.byteOffset, iv.byteLength)

  // Increment the IV starting from the least significant byte
  for (let i = iv.length - 1; i >= 0; i--) {
    const current = view.getUint8(i)
    const result = current + increment

    // Update the current byte
    view.setUint8(i, result % 256)

    // Calculate carry for the next byte
    increment = Math.floor(result / 256)

    if (increment === 0) {
      break // Exit early if no carry is left
    }
  }

  if (increment > 0) {
    throw new Error('IV overflowed beyond its length')
  }
}

// Concatenate all the chunks
const assembleChunks = (chunks: Uint8Array[]) => {
  const concatenatedBuffer = concatenate(chunks)
  const totalLength = concatenatedBuffer.length
  const blockSize = 16
  const roundedLength = Math.floor(totalLength / blockSize) * blockSize
  const concatenated = concatenatedBuffer.subarray(0, roundedLength) // No copying
  const remainder = concatenatedBuffer.subarray(roundedLength) // No copying
  return { concatenated, remainder }
}

export class PgpEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  passPhrase: string
  constructor(innerStorage: Storage, passPhrase: string) {
    super()
    this.innerStorage = innerStorage
    crypto.subtle.importKey
    this.passPhrase = passPhrase
  }

  static async create(innerStorage: Storage, passPhrase: string) {
    return new PgpEncryptingStorage(innerStorage, passPhrase)
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const encryptedStream = await this.innerStorage.readStream(path)
    const { data: clearStream } = await openpgp.decrypt({
      message: await openpgp.readMessage({ binaryMessage: encryptedStream }),
      passwords: [this.passPhrase], // Use the passphrase for encryption
      format: 'binary', // Use 'binary' format for streaming
    })
    return clearStream
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>, size: number): Promise<void> {
    const encryptedStream = await openpgp.encrypt({
      message: await openpgp.createMessage({ binary: stream }),
      passwords: [this.passPhrase], // Use the passphrase for encryption
      format: 'binary', // Use 'binary' format for streaming
    })
    return this.innerStorage.writeStream(path, encryptedStream, size)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }
}
