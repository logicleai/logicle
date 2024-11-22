import { Storage, BaseStorage } from './api'

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

const getHashPrefix = async (text: string, ivLength: number) => {
  var hash = new Uint8Array(await crypto.subtle.digest('SHA-1', Buffer.from(text)))
  // Use the first 'ivLength' bytes of the hash as the IV
  return hash.slice(0, ivLength)
}

export class EncryptingStorage extends BaseStorage {
  innerStorage: Storage
  key: CryptoKey
  constructor(innerStorage: Storage, key: CryptoKey) {
    super()
    this.innerStorage = innerStorage
    crypto.subtle.importKey
    this.key = key
  }

  static async create(innerStorage: Storage, keyText: string) {
    const key = await getHashPrefix(keyText, 32)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', // Format of the key data
      key, // The raw key data
      { name: 'AES-CTR' }, // Algorithm the key will be used with
      true, // Whether the key is extractable
      ['encrypt', 'decrypt'] // Usages for the key
    )
    return new EncryptingStorage(innerStorage, cryptoKey)
  }

  async readStream(path: string): Promise<ReadableStream<Uint8Array>> {
    const innerStream = await this.innerStorage.readStream(path)
    return await this.createProcessingStream(path, innerStream)
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>, size: number): Promise<void> {
    const cacheWritingStream = await this.createProcessingStream(path, stream)
    return this.innerStorage.writeStream(path, cacheWritingStream, size)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }

  private async createProcessingStream(path: string, stream: ReadableStream<Uint8Array>) {
    let chunks: Uint8Array[] = []
    const iv = await getHashPrefix(path, 32) // Creates a 16-byte Uint8Array initialized to zeros
    const getAvailableDataAligned16 = () => {
      const { concatenated: dataToSend, remainder } = assembleChunks(chunks)
      chunks = [remainder]
      return dataToSend
    }

    const encrypt = async (clearText: Uint8Array) => {
      const encrypted = await crypto.subtle.encrypt(
        {
          name: 'AES-CTR',
          counter: iv, // Use the current counter
          length: 64, // Bit length for the counter (typical is 64 or 128)
        },
        this.key,
        clearText
      )
      rollIv(iv, encrypted.byteLength / 16)
      return new Uint8Array(encrypted)
    }

    return new ReadableStream({
      start(controller) {
        const reader = stream.getReader()
        async function push() {
          const { done, value } = await reader.read()
          if (done) {
            const clearText = concatenate(chunks)
            const encryptedData = await encrypt(clearText)
            controller.enqueue(encryptedData)
            controller.close()
            return
          }
          chunks.push(value) // Collect data for Buffer
          const clearText = getAvailableDataAligned16()
          const encryptedData = await encrypt(clearText)
          controller.enqueue(encryptedData)
          await push() // Read the next chunk
        }
        void push()
      },
    })
  }
}
