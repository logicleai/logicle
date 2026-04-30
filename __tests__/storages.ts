import { test, expect, vi } from 'vitest'
import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { CachingStorage } from '@/lib/storage/CachingStorage'
import { AesEncryptingStorage } from '@/ee/AesEncryptingStorage'
import { PgpEncryptingStorage } from '@/ee/PgpEncryptingStorage'
import { FsStorage } from '@/lib/storage/FsStorage'
import { BaseStorage, StorageReadOptions } from '@/lib/storage/api'
import { collectStreamToBuffer, bufferToReadableStream } from '@/lib/storage/utils'

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
    _encrypted?: boolean,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    this.readCalls += 1
    this.readOptionsLog.push(options)
    return bufferToReadableStream(this.map[path])
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>) {
    this.writeCalls += 1
    const buffer = await collectStreamToBuffer(stream)
    this.map[path] = buffer
  }
}

test('TestFsStorageWriteFailingReadableStream', async () => {
  const fsStorage = new FsStorage('/tmp')
  await expect(fsStorage.writeStream(fileName, makeFailingReadableStream())).rejects.toBeInstanceOf(
    Error
  )
})

test('TestMemoryStorage', async () => {
  const storage = new MemoryStorage()
  await storage.writeBuffer(fileName, Buffer.from('just testing'), false)
  const aaaa = await storage.readBuffer(fileName, false)
  expect(aaaa.toString()).toBe('just testing')
})

test('TestCachingStorage', async () => {
  const storage = new CachingStorage(new MemoryStorage(), 1)
  await storage.writeBuffer(fileName, Buffer.from('just testing'), false)
  const aaaa = await storage.readBuffer(fileName, false)
  expect(aaaa.toString()).toBe('just testing')
})

test('CachingStorage serves repeated small reads from cache', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), false)

  const firstRead = await storage.readBuffer(fileName, false)
  const secondRead = await storage.readBuffer(fileName, false)

  expect(firstRead.toString()).toBe('small payload')
  expect(secondRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(1)
})

test('CachingStorage proactively bypasses cache for oversized expected size', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), false)

  const firstRead = await storage.readBuffer(fileName, false)
  const secondStream = await storage.readStream(fileName, false, { expectedSizeBytes: 2 * 1048576 })
  const secondRead = await collectStreamToBuffer(secondStream)
  const thirdRead = await storage.readBuffer(fileName, false)

  expect(firstRead.toString()).toBe('small payload')
  expect(secondRead.toString()).toBe('small payload')
  expect(thirdRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage bypassCache option skips cache and does not evict cached value', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  await inner.writeBuffer(fileName, Buffer.from('small payload'), false)

  await storage.readBuffer(fileName, false)
  const bypassedStream = await storage.readStream(fileName, false, { bypassCache: true })
  const bypassedRead = await collectStreamToBuffer(bypassedStream)
  const cachedRead = await storage.readBuffer(fileName, false)

  expect(bypassedRead.toString()).toBe('small payload')
  expect(cachedRead.toString()).toBe('small payload')
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage does not cache large streams discovered at runtime', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  const payload = Buffer.alloc(2 * 1048576, 7)
  await inner.writeBuffer(fileName, payload, false)

  const firstRead = await storage.readBuffer(fileName, false)
  const secondRead = await storage.readBuffer(fileName, false)

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
      _encrypted?: boolean,
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

  const firstStream = await storage.readStream(fileName, false)
  const firstRead = await collectStreamToBuffer(firstStream)
  const secondRead = await storage.readBuffer(fileName, false)

  expect(firstRead.equals(payload)).toBe(true)
  expect(secondRead.equals(payload)).toBe(true)
  expect(inner.readCalls).toBe(2)
})

test('CachingStorage caches writes when payload fits cache size', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)

  await storage.writeBuffer(fileName, Buffer.from('write cached'), false)
  const firstRead = await storage.readBuffer(fileName, false)
  const secondRead = await storage.readBuffer(fileName, false)

  expect(firstRead.toString()).toBe('write cached')
  expect(secondRead.toString()).toBe('write cached')
  expect(inner.readCalls).toBe(0)
})

test('CachingStorage does not cache oversized writes', async () => {
  const inner = new InstrumentedStorage()
  const storage = new CachingStorage(inner, 1)
  const payload = Buffer.alloc(2 * 1048576, 4)

  await storage.writeBuffer(fileName, payload, false)
  const firstRead = await storage.readBuffer(fileName, false)
  const secondRead = await storage.readBuffer(fileName, false)

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
    false
  )
  const firstRead = await storage.readBuffer(fileName, false)
  const secondRead = await storage.readBuffer(fileName, false)

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

  await expect(collectStreamToBuffer(await storage.readStream(fileName, false))).rejects.toThrow(
    'boom: upload reader failed'
  )
})

test('TestAesEncryptingStorageShortString', async () => {
  const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
  const text = 'just testing'
  {
    await storage.writeBuffer(fileName, Buffer.from(text), true)
    const buf = await storage.readBuffer(fileName, true)
    expect(buf.toString()).toBe(text)
  }
  {
    await storage.writeBuffer(fileName, Buffer.from(text), false)
    const buf = await storage.readBuffer(fileName, false)
    expect(buf.toString()).toBe(text)
  }
})

test('TestAesEncryptingStorageNotSoShortString', async () => {
  const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
  const text = 'just testing just testing just testing just testing just testing'
  await storage.writeBuffer(fileName, Buffer.from(text), true)
  const buf = await storage.readBuffer(fileName, true)
  expect(buf.toString()).toBe(text)
})

test('TestAesEncryptingStorageLargeChunkedStream', async () => {
  const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
  const chunks = [
    Buffer.alloc(7, 1),
    Buffer.alloc(31, 2),
    Buffer.alloc(800_000, 3),
    Buffer.alloc(400_003, 4),
  ]
  const payload = Buffer.concat(chunks)

  await storage.writeStream(
    fileName,
    makeChunkedReadableStream(chunks.map((chunk) => new Uint8Array(chunk))),
    true
  )
  const buf = await storage.readBuffer(fileName, true)

  expect(buf.equals(payload)).toBe(true)
})

test('TestAesEncryptingStorageRejectsNegativeCounterIncrement', async () => {
  const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
  const encryptSpy = vi
    .spyOn(crypto.subtle, 'encrypt')
    .mockResolvedValue({ byteLength: -16 } as ArrayBuffer)

  await expect(storage.writeBuffer(fileName, Buffer.from('x'), true)).rejects.toThrow(
    'Increment must be non-negative'
  )

  encryptSpy.mockRestore()
})

test('TestAesEncryptingStorageRejectsCounterOverflow', async () => {
  const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
  const encryptSpy = vi
    .spyOn(crypto.subtle, 'encrypt')
    .mockResolvedValue({ byteLength: Number.POSITIVE_INFINITY } as ArrayBuffer)

  await expect(storage.writeBuffer(fileName, Buffer.from('x'), true)).rejects.toThrow(
    'IV overflowed beyond its length'
  )

  encryptSpy.mockRestore()
})

test('TestPgpEncryptingStorageShortString', async () => {
  const memoryStorage = new MemoryStorage()
  const storage = await PgpEncryptingStorage.create(memoryStorage, password)
  const text = 'just testing'
  {
    await storage.writeBuffer(fileName, Buffer.from(text), true)
    const buf = await storage.readBuffer(fileName, true)
    expect(buf.toString()).toBe(text)
  }
  {
    await storage.writeBuffer(fileName, Buffer.from(text), false)
    const buf = await storage.readBuffer(fileName, false)
    expect(buf.toString()).toBe(text)
  }
})

test('TestPgpEncryptingStorageNotSoShortString', async () => {
  const storage = await PgpEncryptingStorage.create(new MemoryStorage(), password)
  const text = 'just testing just testing just testing just testing just testing'
  await storage.writeBuffer(fileName, Buffer.from(text), true)
  const buf = await storage.readBuffer(fileName, true)
  expect(buf.toString()).toBe(text)
})
