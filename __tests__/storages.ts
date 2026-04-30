import { test, expect } from 'vitest'
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
