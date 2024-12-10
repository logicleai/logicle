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

export class PgpEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  passPhrase: string
  constructor(innerStorage: Storage, passPhrase: string) {
    super()
    this.innerStorage = innerStorage
    this.passPhrase = passPhrase
  }

  static async create(innerStorage: Storage, passPhrase: string) {
    return new PgpEncryptingStorage(innerStorage, passPhrase)
  }

  async readStream(path: string, encrypted: boolean): Promise<ReadableStream<Uint8Array>> {
    const innerStream = await this.innerStorage.readStream(path, encrypted)
    if (!encrypted) return innerStream
    const { data: clearStream } = await openpgp.decrypt({
      message: await openpgp.readMessage({ binaryMessage: innerStream }),
      passwords: [this.passPhrase], // Use the passphrase for encryption
      format: 'binary', // Use 'binary' format for streaming
    })
    return clearStream
  }

  async writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    size: number,
    encrypted: boolean
  ): Promise<void> {
    if (encrypted) {
      stream = await openpgp.encrypt({
        message: await openpgp.createMessage({ binary: stream }),
        passwords: [this.passPhrase], // Use the passphrase for encryption
        format: 'binary', // Use 'binary' format for streaming
      })
    }
    return this.innerStorage.writeStream(path, stream, size, encrypted)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }
}
