import { Storage, BaseStorage } from '@/lib/storage/api'
import * as openpgp from 'openpgp'

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
