import { test, expect, vi } from 'vitest'
import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { CachingStorage } from '@/lib/storage/CachingStorage'
import { AeadEncryptingStorage } from '@/ee/AeadEncryptingStorage'
import { PgpEncryptingStorage } from '@/ee/PgpEncryptingStorage'
import { FsStorage } from '@/lib/storage/FsStorage'
import { BaseStorage, StorageEncryption, StorageReadOptions } from '@/lib/storage/api'
import { collectStreamToBuffer, bufferToReadableStream } from '@/lib/storage/utils'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const fileName = 'test'
const password = 'my_key'

function makeFailingReadableStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.error(new Error('boom: upload reader failed'))
    },
  })
}

function makeChunkedReadableStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let chunkIndex = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[chunkIndex++]
      if (!chunk) {
        controller.close()
        return
      }
      controller.enqueue(chunk)
    },
  })
}

class InstrumentedStorage extends BaseStorage {
  map: Record<string, Uint8Array> = {}
  readCalls = 0
  writeCalls = 0
  readOptionsLog: Array<StorageReadOptions | undefined> = []

  async rm(path: string) {
    delete this.map[path]
  }

  async readStream(
    path: string,
    _encryption: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    this.readCalls += 1
    this.readOptionsLog.push(options)
    const buffer = this.map[path]
    if (typeof options?.rangeStart === 'number' || typeof options?.rangeEnd === 'number') {
      const start = options.rangeStart ?? 0
      const end = options.rangeEnd === undefined ? buffer.length : options.rangeEnd + 1
      return bufferToReadableStream(buffer.subarray(start, end))
    }
    return bufferToReadableStream(buffer)
  }

  async writeStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    _encryption: StorageEncryption
  ) {
    this.writeCalls += 1
    const buffer = await collectStreamToBuffer(stream)
    this.map[path] = buffer
  }
}

test('TestFsStorageWriteFailingReadableStream', async () => {
  const fsStorage = new FsStorage('/tmp')
  await expect(fsStorage.writeStream(fileName, makeFailingReadableStream(), null)).rejects.toBeInstanceOf(
    Error
  )
})

test('TestMemoryStorage', async () => {
  const storage = new MemoryStorage()
  await storage.writeBuffer(fileName, Buffer.from('just testing'), null)
  const aaaa = await storage.readBuffer(fileName, null)
  expect(aaaa.toString()).toBe('just testing')
})

test('MemoryStorage supports byte ranges', async () => {
  const storage = new MemoryStorage()
  await storage.writeBuffer(fileName, Buffer.from('just testing'), null)
  const ranged = await collectStreamToBuffer(
    await storage.readStream(fileName, null, { rangeStart: 5, rangeEnd: 11 })
  )
  expect(ranged.toString()).toBe('testing')
})

test('FsStorage supports byte ranges', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'logicle-storage-'))
  const storage = new FsStorage(root)
  try {
    await storage.writeBuffer(fileName, Buffer.from('just testing'), null)
    const ranged = await collectStreamToBuffer(
      await storage.readStream(fileName, null, { rangeStart: 5, rangeEnd: 11 })
    )
    expect(ranged.toString()).toBe('testing')
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true })
  }
})

test('TestCachingStorage', async () => {
  const storage = new CachingStorage(new MemoryStorage(), 1)
  await storage.writeBuffer(fileName, Buffer.from('just testing'), null)
  const aaaa = await storage.readBuffer(fileName, null)
  expect(aaaa.toString()).toBe('just testing')
})

test('CachingStorage serves repeated small reads from cache', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), null)

  const firstRead = await storage.readBuffer(fileName, null)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.toString()).toBe('small payload')
  expect(secondRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(1)
})

test('CachingStorage proactively bypasses cache for oversized expected size', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), null)

  const firstRead = await storage.readBuffer(fileName, null)
  const secondStream = await storage.readStream(fileName, null, { expectedSizeBytes: 2 * 1048576 })
  const secondRead = await collectStreamToBuffer(secondStream)
  const thirdRead = await storage.readBuffer(fileName, null)

  expect(firstRead.toString()).toBe('small payload')
  expect(secondRead.toString()).toBe('small payload')
  expect(thirdRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage bypassCache option skips cache and does not evict cached value', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), null)

  await storage.readBuffer(fileName, null)
  const bypassedStream = await storage.readStream(fileName, null, { bypassCache: true })
  const bypassedRead = await collectStreamToBuffer(bypassedStream)
  const cachedRead = await storage.readBuffer(fileName, null)

  expect(bypassedRead.toString()).toBe('small payload')
  expect(cachedRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage does not cache large streams discovered at runtime', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  const payload = Buffer.alloc(2 * 1048576, 7)
  await inner.writeBuffer(fileName, payload, null)

  const firstRead = await storage.readBuffer(fileName, null)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.equals(payload)).toBe(true)
  expect(secondRead.equals(payload)).toBe(true)
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage does not cache unknown-size streams that grow past the limit mid-read', async () => {
  const payloadChunks = [
    Buffer.alloc(400_000, 1),
    Buffer.alloc(400_000, 2),
    Buffer.alloc(400_000, 3),
  ]
  const payload = Buffer.concat(payloadChunks)
  const inner = new (class extends InstrumentedStorage {
    override async readStream(
      path: string,
      _encryption: StorageEncryption,
      options?: StorageReadOptions
    ): Promise<ReadableStream<Uint8Array>> {
      this.readCalls += 1
      this.readOptionsLog.push(options)
      return makeChunkedReadableStream(
        this.map[path] ? payloadChunks.map((chunk) => new Uint8Array(chunk)) : []
      )
    }
  })()
  const storage = new CachingStorage(inner, 1)
  inner.map[fileName] = payload

  const firstStream = await storage.readStream(fileName, null)
  const firstRead = await collectStreamToBuffer(firstStream)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.equals(payload)).toBe(true)
  expect(secondRead.equals(payload)).toBe(true)
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage caches writes when payload fits cache size', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)

  await storage.writeBuffer(fileName, Buffer.from('write cached'), null)
  const firstRead = await storage.readBuffer(fileName, null)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.toString()).toBe('write cached')
  expect(secondRead.toString()).toBe('write cached')
  expect(inner.readCalls).toBe(0)
})

test('CachingStorage does not cache oversized writes', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  const payload = Buffer.alloc(2 * 1048576, 4)

  await storage.writeBuffer(fileName, payload, null)
  const firstRead = await storage.readBuffer(fileName, null)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.equals(payload)).toBe(true)
  expect(secondRead.equals(payload)).toBe(true)
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage delegates removals to inner storage', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  inner.map[fileName] = Buffer.from('exists')

  await storage.rm(fileName)

  expect(inner.map[fileName]).toBeUndefined()
})

test('CachingStorage does not cache unknown-size streamed writes that grow past the limit', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  const chunks = [
    Buffer.alloc(400_000, 5),
    Buffer.alloc(400_000, 6),
    Buffer.alloc(400_000, 7),
  ]
  const payload = Buffer.concat(chunks)

  await storage.writeStream(
    fileName,
    makeChunkedReadableStream(chunks.map((chunk) => new Uint8Array(chunk))),
    null
  )
  const firstRead = await storage.readBuffer(fileName, null)
  const secondRead = await storage.readBuffer(fileName, null)

  expect(firstRead.equals(payload)).toBe(true)
  expect(secondRead.equals(payload)).toBe(true)
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage propagates read failures from the inner stream', async () => {
  const inner = new (class extends InstrumentedStorage {
    override async readStream(): Promise<ReadableStream<Uint8Array>> {
      this.readCalls += 1
      return makeFailingReadableStream()
    }
  })()
  const storage = new CachingStorage(inner, 1)

  await expect(collectStreamToBuffer(await storage.readStream(fileName, null))).rejects.toThrow(
    'boom: upload reader failed'
  )
})

test('TestPgpEncryptingStorageShortString', async () => {
  const memoryStorage = new MemoryStorage()
  const storage = await PgpEncryptingStorage.create(memoryStorage, password)
  const text = 'just testing'
  {
    await storage.writeBuffer(fileName, Buffer.from(text), 'pgp')
    const buf = await storage.readBuffer(fileName, 'pgp')
    expect(buf.toString()).toBe(text)
  }
  {
    await storage.writeBuffer(fileName, Buffer.from(text), null)
    const buf = await storage.readBuffer(fileName, null)
    expect(buf.toString()).toBe(text)
  }
})

test('TestPgpEncryptingStorageNotSoShortString', async () => {
  const storage = await PgpEncryptingStorage.create(new MemoryStorage(), password)
  const text = 'just testing just testing just testing just testing just testing'
  await storage.writeBuffer(fileName, Buffer.from(text), 'pgp')
  const buf = await storage.readBuffer(fileName, 'pgp')
  expect(buf.toString()).toBe(text)
})

test('AeadEncryptingStorage writes AEAD v1 encrypted blobs', async () => {
  const inner = new MemoryStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)

  await storage.writeBuffer(fileName, Buffer.from('seekable data'), 'aead')

  expect(Buffer.from(inner.map[fileName].subarray(0, 15)).toString()).toBe('LOGICLE-AEAD-V1')
  await expect(storage.readBuffer(fileName, 'aead')).resolves.toEqual(Buffer.from('seekable data'))
})

test('AeadEncryptingStorage AEAD v1 encryption is randomized and hides plaintext', async () => {
  const inner = new MemoryStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)
  const plaintext = Buffer.from('same plaintext payload')

  await storage.writeBuffer('a', plaintext, 'aead')
  await storage.writeBuffer('b', plaintext, 'aead')

  expect(Buffer.from(inner.map.a).equals(Buffer.from(inner.map.b))).toBe(false)
  expect(Buffer.from(inner.map.a).includes(plaintext)).toBe(false)
  expect(Buffer.from(inner.map.b).includes(plaintext)).toBe(false)
})

test.each([
  ['one byte before chunk boundary', 1024 * 1024 - 1],
  ['exactly one chunk', 1024 * 1024],
  ['one byte after chunk boundary', 1024 * 1024 + 1],
])('AeadEncryptingStorage AEAD v1 full reads cover %s', async (_label, size) => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  const payload = Buffer.alloc(size)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 253
  await storage.writeBuffer(`${fileName}-${size}`, payload, 'aead')
  await expect(storage.readBuffer(`${fileName}-${size}`, 'aead')).resolves.toEqual(payload)
}, 30_000)

test('AeadEncryptingStorage supports plaintext range reads for AEAD v1 blobs', async () => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  const text = '0123456789abcdefghijklmnopqrstuvwxyz'
  await storage.writeBuffer(fileName, Buffer.from(text), 'aead')

  const ranged = await collectStreamToBuffer(
    await storage.readStream(fileName, 'aead', { rangeStart: 10, rangeEnd: 19 })
  )

  expect(ranged.toString()).toBe('abcdefghij')
})

test('AeadEncryptingStorage supports single-byte AEAD v1 range reads at chunk boundary', async () => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  const payload = Buffer.alloc(1024 * 1024 + 2)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251
  await storage.writeBuffer(fileName, payload, 'aead')

  const ranged = await collectStreamToBuffer(
    await storage.readStream(fileName, 'aead', {
      rangeStart: 1024 * 1024,
      rangeEnd: 1024 * 1024,
    })
  )

  expect(ranged).toEqual(payload.subarray(1024 * 1024, 1024 * 1024 + 1))
})

test('AeadEncryptingStorage supports AEAD v1 range reads across chunk boundaries', async () => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  const payload = Buffer.alloc(1024 * 1024 + 64)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251
  await storage.writeBuffer(fileName, payload, 'aead')

  const rangeStart = 1024 * 1024 - 8
  const rangeEnd = 1024 * 1024 + 15
  const ranged = await collectStreamToBuffer(
    await storage.readStream(fileName, 'aead', { rangeStart, rangeEnd })
  )

  expect(ranged).toEqual(payload.subarray(rangeStart, rangeEnd + 1))
})

test('AeadEncryptingStorage AEAD v1 range reads fetch only header and needed chunks', async () => {
  const inner = new InstrumentedStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)
  const payload = Buffer.alloc(3 * 1024 * 1024 + 32)
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251
  await storage.writeBuffer(fileName, payload, 'aead')
  inner.readOptionsLog = []
  inner.readCalls = 0

  const rangeStart = 1024 * 1024 + 5
  const rangeEnd = 1024 * 1024 + 20
  const ranged = await collectStreamToBuffer(
    await storage.readStream(fileName, 'aead', { rangeStart, rangeEnd })
  )

  expect(ranged).toEqual(payload.subarray(rangeStart, rangeEnd + 1))
  expect(inner.readCalls).toBe(2)
  expect(inner.readOptionsLog).toEqual([
    expect.objectContaining({ rangeStart: 0, rangeEnd: 63 }),
    expect.objectContaining({
      rangeStart: 64 + 1024 * 1024 + 16,
      rangeEnd: 64 + 2 * 1024 * 1024 + 31,
    }),
  ])
})

test('AeadEncryptingStorage rejects invalid AEAD v1 read ranges', async () => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  await storage.writeBuffer(fileName, Buffer.from('0123456789'), 'aead')

  await expect(storage.readStream(fileName, 'aead', { rangeStart: -1, rangeEnd: 1 })).rejects.toThrow(
    'Invalid AEAD read range'
  )
  await expect(storage.readStream(fileName, 'aead', { rangeStart: 5, rangeEnd: 4 })).rejects.toThrow(
    'Invalid AEAD read range'
  )
  await expect(storage.readStream(fileName, 'aead', { rangeStart: 0, rangeEnd: 10 })).rejects.toThrow(
    'Invalid AEAD read range'
  )
})

test('AeadEncryptingStorage rejects AEAD v1 blobs with the wrong key', async () => {
  const inner = new MemoryStorage()
  const writer = await AeadEncryptingStorage.create(inner, password)
  const reader = await AeadEncryptingStorage.create(inner, `${password}-wrong`)
  await writer.writeBuffer(fileName, Buffer.from('secret'), 'aead')

  await expect(reader.readBuffer(fileName, 'aead')).rejects.toThrow()
})

test('AeadEncryptingStorage detects AEAD v1 ciphertext tampering', async () => {
  const inner = new MemoryStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)
  await storage.writeBuffer(fileName, Buffer.from('authenticated payload'), 'aead')

  inner.map[fileName][64] ^= 0xff

  await expect(storage.readBuffer(fileName, 'aead')).rejects.toThrow()
})

test('AeadEncryptingStorage detects AEAD v1 tag tampering', async () => {
  const inner = new MemoryStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)
  await storage.writeBuffer(fileName, Buffer.from('authenticated payload'), 'aead')

  inner.map[fileName][inner.map[fileName].length - 1] ^= 0xff

  await expect(storage.readBuffer(fileName, 'aead')).rejects.toThrow()
})

test('AeadEncryptingStorage detects AEAD v1 authenticated header tampering', async () => {
  const tamperOffsets = [
    16, // chunk size
    20, // plaintext size
    28, // salt
  ]

  for (const offset of tamperOffsets) {
    const inner = new MemoryStorage()
    const storage = await AeadEncryptingStorage.create(inner, password)
    await storage.writeBuffer(fileName, Buffer.from('authenticated payload'), 'aead')

    inner.map[fileName][offset] ^= 0x01

    await expect(storage.readBuffer(fileName, 'aead')).rejects.toThrow()
  }
})

test('AeadEncryptingStorage rejects truncated AEAD v1 chunks', async () => {
  const inner = new MemoryStorage()
  const storage = await AeadEncryptingStorage.create(inner, password)
  await storage.writeBuffer(fileName, Buffer.from('authenticated payload'), 'aead')

  inner.map[fileName] = inner.map[fileName].subarray(0, inner.map[fileName].length - 1)

  await expect(storage.readBuffer(fileName, 'aead')).rejects.toThrow()
})

test('PgpEncryptingStorage rejects range reads for legacy PGP blobs', async () => {
  const inner = new MemoryStorage()
  await inner.writeBuffer(fileName, Buffer.from([0x84, 0x01, 0x02, 0x03]), 'pgp')
  const storage = await PgpEncryptingStorage.create(inner, password)

  await expect(storage.readStream(fileName, 'pgp', { rangeStart: 0, rangeEnd: 1 })).rejects.toThrow(
    'Legacy PGP encrypted blobs do not support range reads'
  )
})

test('AeadEncryptingStorage handles empty AEAD v1 blobs', async () => {
  const storage = await AeadEncryptingStorage.create(new MemoryStorage(), password)
  await storage.writeBuffer(fileName, Buffer.alloc(0), 'aead')

  await expect(storage.readBuffer(fileName, 'aead')).resolves.toEqual(Buffer.alloc(0))
})
