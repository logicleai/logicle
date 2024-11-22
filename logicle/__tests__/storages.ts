import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { CachingStorage } from '@/lib/storage/CachingStorage'
import { TextEncoder } from 'util'
import { EncryptingStorage } from '@/lib/storage/EncryptingStorage'

test('TestMemoryStorage', async () => {
  const storage = new MemoryStorage()
  await storage.writeBuffer('test', Buffer.from('just testing'))
  const aaaa = await storage.readBuffer('test')
  expect(aaaa.toString()).toBe('just testing')
})

test('TestCachingStorage', async () => {
  const storage = new CachingStorage(new MemoryStorage(), 1)
  await storage.writeBuffer('test', Buffer.from('just testing'))
  const aaaa = await storage.readBuffer('test')
  expect(aaaa.toString()).toBe('just testing')
})

test('TestEncryptingStorageShortString', async () => {
  const storage = await EncryptingStorage.create(new MemoryStorage())
  const text = 'just testing'
  await storage.writeBuffer('test', Buffer.from(text))
  const buf = await storage.readBuffer('test')
  expect(buf.toString()).toBe(text)
})

test('TestEncryptingStorageNotSoShortString', async () => {
  const storage = await EncryptingStorage.create(new MemoryStorage())
  const text = 'just testing just testing just testing just testing just testing'
  await storage.writeBuffer('test', Buffer.from(text))
  const buf = await storage.readBuffer('test')
  expect(buf.toString()).toBe(text)
})
