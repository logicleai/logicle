import { Storage, BaseStorage, StorageReadOptions, StorageEncryption } from '@/lib/storage/api'
import { bufferToReadableStream, collectStreamToBuffer } from '@/lib/storage/utils'
import { ensureABView } from '@/backend/lib/utils'

const AEAD_MAGIC = Buffer.from('LOGICLE-AEAD-V1')
const AEAD_HEADER_SIZE = 64
const AEAD_CHUNK_SIZE = 1024 * 1024
const AEAD_TAG_SIZE = 16
const AEAD_SALT_SIZE = 12
const AEAD_CHUNK_INDEX_SIZE = 8

interface AeadHeader {
  bytes: Uint8Array
  chunkSize: number
  plaintextSize: number
  salt: Uint8Array
}

function isAead(encrypted: StorageEncryption): boolean {
  return encrypted === 'aead'
}

function makeAeadHeader(plaintextSize: number, salt: Uint8Array): AeadHeader {
  if (!Number.isSafeInteger(plaintextSize) || plaintextSize < 0) {
    throw new Error(`Invalid AEAD plaintext size: ${plaintextSize}`)
  }
  if (salt.length !== AEAD_SALT_SIZE) {
    throw new Error(`Invalid AEAD salt size: ${salt.length}`)
  }
  const bytes = new Uint8Array(AEAD_HEADER_SIZE)
  bytes.set(AEAD_MAGIC, 0)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint32(16, AEAD_CHUNK_SIZE, false)
  view.setBigUint64(20, BigInt(plaintextSize), false)
  bytes.set(salt, 28)
  return { bytes, chunkSize: AEAD_CHUNK_SIZE, plaintextSize, salt }
}

function parseAeadHeader(bytes: Uint8Array): AeadHeader {
  if (bytes.length !== AEAD_HEADER_SIZE) {
    throw new Error(`Invalid AEAD header size: ${bytes.length}`)
  }
  for (let i = 0; i < AEAD_MAGIC.length; i++) {
    if (bytes[i] !== AEAD_MAGIC[i]) throw new Error('Invalid AEAD magic')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkSize = view.getUint32(16, false)
  const plaintextSize = Number(view.getBigUint64(20, false))
  if (!Number.isSafeInteger(plaintextSize)) {
    throw new Error(`AEAD plaintext size is too large: ${plaintextSize}`)
  }
  if (chunkSize !== AEAD_CHUNK_SIZE) {
    throw new Error(`Unsupported AEAD chunk size: ${chunkSize}`)
  }
  return {
    bytes,
    chunkSize,
    plaintextSize,
    salt: bytes.subarray(28, 28 + AEAD_SALT_SIZE),
  }
}

function makeChunkNonce(chunkIndex: number): Uint8Array {
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffffffff) {
    throw new Error(`Invalid AEAD chunk index: ${chunkIndex}`)
  }
  const nonce = new Uint8Array(12)
  new DataView(nonce.buffer).setUint32(8, chunkIndex, false)
  return nonce
}

function makeChunkAad(header: AeadHeader, chunkIndex: number): Uint8Array {
  const aad = new Uint8Array(AEAD_HEADER_SIZE + AEAD_CHUNK_INDEX_SIZE)
  aad.set(header.bytes, 0)
  new DataView(aad.buffer).setBigUint64(AEAD_HEADER_SIZE, BigInt(chunkIndex), false)
  return aad
}

function concatenate(chunks: Uint8Array[]): Buffer {
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
}

export class AeadEncryptingStorage extends BaseStorage {
  innerStorage: Storage
  private keyBytesPromise: Promise<Uint8Array>

  constructor(innerStorage: Storage, passPhrase: string) {
    super()
    this.innerStorage = innerStorage
    this.keyBytesPromise = crypto.subtle
      .digest('SHA-256', Buffer.from(passPhrase))
      .then((keyBytes) => new Uint8Array(keyBytes))
  }

  static async create(innerStorage: Storage, passPhrase: string) {
    return new AeadEncryptingStorage(innerStorage, passPhrase)
  }

  async readStream(
    path: string,
    encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    if (!isAead(encrypted)) return this.innerStorage.readStream(path, encrypted, options)

    const headerBytes = await collectStreamToBuffer(
      await this.innerStorage.readStream(path, null, {
        ...options,
        rangeStart: 0,
        rangeEnd: AEAD_HEADER_SIZE - 1,
      })
    )
    return bufferToReadableStream(await this.readAeadBuffer(path, headerBytes, options))
  }

  async writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    encrypted: StorageEncryption
  ): Promise<void> {
    if (!isAead(encrypted)) return this.innerStorage.writeStream(path, stream, encrypted)

    const encryptedBytes = await this.encryptAeadBuffer(await collectStreamToBuffer(stream))
    return this.innerStorage.writeStream(path, bufferToReadableStream(encryptedBytes), null)
  }

  rm(path: string): Promise<void> {
    return this.innerStorage.rm(path)
  }

  private async deriveAeadKey(header: AeadHeader): Promise<CryptoKey> {
    const keyBytes = await this.keyBytesPromise
    const hkdfKey = await crypto.subtle.importKey('raw', ensureABView(keyBytes), 'HKDF', false, [
      'deriveKey',
    ])
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: ensureABView(header.salt),
        info: Buffer.from('logicle/aead-v1/content-key'),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  private async encryptAeadBuffer(plaintext: Uint8Array): Promise<Buffer> {
    const salt = crypto.getRandomValues(new Uint8Array(AEAD_SALT_SIZE))
    const header = makeAeadHeader(plaintext.length, salt)
    const key = await this.deriveAeadKey(header)
    const chunks: Uint8Array[] = [header.bytes]
    const chunkCount = Math.max(1, Math.ceil(plaintext.length / header.chunkSize))
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const start = chunkIndex * header.chunkSize
      const clearChunk = plaintext.subarray(start, Math.min(start + header.chunkSize, plaintext.length))
      const encryptedChunk = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: ensureABView(makeChunkNonce(chunkIndex)),
          additionalData: ensureABView(makeChunkAad(header, chunkIndex)),
          tagLength: AEAD_TAG_SIZE * 8,
        },
        key,
        ensureABView(clearChunk)
      )
      chunks.push(new Uint8Array(encryptedChunk))
    }
    return concatenate(chunks)
  }

  private async readAeadBuffer(
    path: string,
    headerBytes: Uint8Array,
    options?: StorageReadOptions
  ): Promise<Buffer> {
    const header = parseAeadHeader(headerBytes)
    const key = await this.deriveAeadKey(header)
    if (header.plaintextSize === 0) {
      const encryptedChunk = await collectStreamToBuffer(
        await this.innerStorage.readStream(path, null, {
          ...options,
          rangeStart: AEAD_HEADER_SIZE,
          rangeEnd: AEAD_HEADER_SIZE + AEAD_TAG_SIZE - 1,
        })
      )
      await this.decryptAeadChunk(key, header, 0, encryptedChunk)
      return Buffer.alloc(0)
    }

    const rangeStart = options?.rangeStart ?? 0
    const rangeEnd = options?.rangeEnd ?? header.plaintextSize - 1
    if (rangeStart < 0 || rangeEnd < rangeStart || rangeEnd >= header.plaintextSize) {
      throw new Error(
        `Invalid AEAD read range ${rangeStart}-${rangeEnd} for ${header.plaintextSize} byte blob`
      )
    }

    const firstChunk = Math.floor(rangeStart / header.chunkSize)
    const lastChunk = Math.floor(rangeEnd / header.chunkSize)
    const decryptedChunks: Uint8Array[] = []
    for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex++) {
      const encryptedOffset = AEAD_HEADER_SIZE + chunkIndex * (header.chunkSize + AEAD_TAG_SIZE)
      const plaintextLength = this.getAeadChunkPlaintextLength(header, chunkIndex)
      const encryptedChunk = await collectStreamToBuffer(
        await this.innerStorage.readStream(path, null, {
          ...options,
          rangeStart: encryptedOffset,
          rangeEnd: encryptedOffset + plaintextLength + AEAD_TAG_SIZE - 1,
        })
      )
      decryptedChunks.push(await this.decryptAeadChunk(key, header, chunkIndex, encryptedChunk))
    }

    const clear = concatenate(decryptedChunks)
    const trimStart = rangeStart - firstChunk * header.chunkSize
    return clear.subarray(trimStart, trimStart + (rangeEnd - rangeStart + 1))
  }

  private getAeadChunkPlaintextLength(header: AeadHeader, chunkIndex: number): number {
    const chunkStart = chunkIndex * header.chunkSize
    return Math.min(header.chunkSize, header.plaintextSize - chunkStart)
  }

  private async decryptAeadChunk(
    key: CryptoKey,
    header: AeadHeader,
    chunkIndex: number,
    encryptedChunk: Uint8Array
  ): Promise<Uint8Array> {
    const clearChunk = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ensureABView(makeChunkNonce(chunkIndex)),
        additionalData: ensureABView(makeChunkAad(header, chunkIndex)),
        tagLength: AEAD_TAG_SIZE * 8,
      },
      key,
      ensureABView(encryptedChunk)
    )
    return new Uint8Array(clearChunk)
  }
}
