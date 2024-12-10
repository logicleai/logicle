import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { CachingStorage } from '@/lib/storage/CachingStorage'
import { AesEncryptingStorage } from '@/ee/AesEncryptingStorage'
import { PgpEncryptingStorage } from '@/ee/PgpEncryptingStorage'

const fileName = 'test'
const password = 'my_key'

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
