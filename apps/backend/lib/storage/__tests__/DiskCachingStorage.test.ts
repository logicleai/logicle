import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { DiskCachingStorage } from '../DiskCachingStorage'
import { BaseStorage, StorageEncryption, StorageReadOptions } from '../api'
import { bufferToReadableStream, collectStreamToBuffer } from '../utils'

class InstrumentedStorage extends BaseStorage {
  readonly values = new Map<string, Buffer>()
  readCalls = 0

  async readStream(
    filePath: string,
    _encrypted: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    this.readCalls += 1
    let value = this.values.get(filePath)!
    if (typeof options?.rangeStart === 'number' || typeof options?.rangeEnd === 'number') {
      value = value.subarray(options.rangeStart ?? 0, (options.rangeEnd ?? value.length - 1) + 1)
    }
    return bufferToReadableStream(value)
  }

  async writeStream(
    filePath: string,
    stream: ReadableStream<Uint8Array>,
    _encrypted: StorageEncryption
  ): Promise<void> {
    this.values.set(filePath, await collectStreamToBuffer(stream))
  }

  async rm(filePath: string): Promise<void> {
    this.values.delete(filePath)
  }
}

const sha256 = (value: Buffer) => createHash('sha256').update(value).digest('hex')

describe('DiskCachingStorage', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  const makeStorage = async (encrypted = true) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'logicle-disk-cache-'))
    temporaryDirectories.push(directory)
    const inner = new InstrumentedStorage()
    const storage = new DiskCachingStorage(
      inner,
      directory,
      1,
      60_000,
      encrypted ? 'cache-key' : undefined
    )
    return { directory, inner, storage }
  }

  test('serves a complete read from disk after the in-memory wrapper is recreated', async () => {
    const first = await makeStorage()
    const payload = Buffer.from('original attachment bytes')
    first.inner.values.set('file', payload)

    await expect(
      first.storage.readBuffer('file', 'aead', {
        expectedSizeBytes: payload.length,
        expectedContentHash: sha256(payload),
      })
    ).resolves.toEqual(payload)
    expect(first.inner.readCalls).toBe(1)
    const secondInner = new InstrumentedStorage()
    const second = new DiskCachingStorage(secondInner, first.directory, 1, 60_000, 'cache-key')
    await expect(
      second.readBuffer('file', 'aead', {
        expectedSizeBytes: payload.length,
        expectedContentHash: sha256(payload),
      })
    ).resolves.toEqual(payload)
    expect(secondInner.readCalls).toBe(0)
  })

  test('invalidates a cached blob when the DB hash or size changes', async () => {
    const { inner, storage } = await makeStorage(false)
    const oldPayload = Buffer.from('old database content')
    const newPayload = Buffer.from('new database content with a different size')
    inner.values.set('file', oldPayload)

    await storage.readBuffer('file', null, {
      expectedSizeBytes: oldPayload.length,
      expectedContentHash: sha256(oldPayload),
    })
    inner.values.set('file', newPayload)

    await expect(
      storage.readBuffer('file', null, {
        expectedSizeBytes: newPayload.length,
        expectedContentHash: sha256(newPayload),
      })
    ).resolves.toEqual(newPayload)
    expect(inner.readCalls).toBe(2)
  })

  test('detects tampering and does not expose encrypted payload on disk', async () => {
    const { directory, inner, storage } = await makeStorage()
    const payload = Buffer.from('a secret original document')
    inner.values.set('file', payload)
    await storage.readBuffer('file', 'aead')

    const [cacheName] = (await readdir(directory)).filter((name) => name.endsWith('.cache'))
    const cachePath = path.join(directory, cacheName!)
    const cachedBytes = await readFile(cachePath)
    expect(cachedBytes.includes(payload)).toBe(false)
    cachedBytes[cachedBytes.length - 1] ^= 1
    await writeFile(cachePath, cachedBytes)

    await expect(storage.readBuffer('file', 'aead')).resolves.toEqual(payload)
    expect(inner.readCalls).toBe(2)
  })

  test('bypasses the disk cache for ranged reads', async () => {
    const { inner, storage } = await makeStorage()
    const payload = Buffer.from('0123456789')
    inner.values.set('file', payload)

    await expect(storage.readBuffer('file', null, { rangeStart: 2, rangeEnd: 5 })).resolves.toEqual(
      Buffer.from('2345')
    )
    await expect(storage.readBuffer('file', null)).resolves.toEqual(payload)
    expect(inner.readCalls).toBe(2)
  })
})
