import { Readable } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CachingStorage } from '@/lib/storage/CachingStorage'
import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { bufferToReadableStream, collectStreamToBuffer } from '@/lib/storage/utils'

const password = 'my_key'

beforeEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('apps/backend/lib/storage/MemoryStorage', () => {
  test('removes stored buffers', async () => {
    const storage = new MemoryStorage()
    await storage.writeBuffer('test', Buffer.from('value'), null)

    await storage.rm('test')

    expect(storage.map.test).toBeUndefined()
  })
})

describe('apps/backend/lib/storage/utils', () => {
  test('destroy node streams when web stream is cancelled', async () => {
    const nodeStream = new Readable({ read() {} })
    const destroySpy = vi.spyOn(nodeStream, 'destroy')
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>

    await webStream.cancel()

    expect(destroySpy).toHaveBeenCalled()
  })
})

// A controlled ReadableStream whose source is only pulled on consumer demand.
// pullCount tracks how many times the source has been asked for data.
function makeCountedStream(chunks: Uint8Array[]): { stream: ReadableStream<Uint8Array>; pullCount: () => number } {
  let count = 0
  let index = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      count++
      if (index < chunks.length) {
        controller.enqueue(chunks[index++])
      } else {
        controller.close()
      }
    },
  })
  return { stream, pullCount: () => count }
}

describe('backpressure', () => {
  test('Readable.toWeb streams data in order and supports mid-stream cancellation', async () => {
    const total = 20
    let readCount = 0
    const nodeStream = new Readable({
      read() {
        if (readCount < total) {
          this.push(Buffer.from([readCount++]))
        } else {
          this.push(null)
        }
      },
    })
    const destroySpy = vi.spyOn(nodeStream, 'destroy')

    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>
    const reader = webStream.getReader()

    // Read only the first 5 chunks
    const received: number[] = []
    for (let i = 0; i < 5; i++) {
      const { value } = await reader.read()
      received.push(value![0])
    }
    expect(received).toEqual([0, 1, 2, 3, 4])

    // Cancel mid-stream — underlying node stream must be destroyed
    await reader.cancel()
    expect(destroySpy).toHaveBeenCalled()
  })

  test('CachingStorage does not consume inner stream until consumer reads', async () => {
    const chunks = Array.from({ length: 10 }, (_, i) => new Uint8Array([i]))
    const { stream: inner, pullCount } = makeCountedStream(chunks)

    const inner_storage = new MemoryStorage()
    vi.spyOn(inner_storage, 'readStream').mockResolvedValue(inner)

    const cachingStorage = new CachingStorage(inner_storage, 10)
    const out = await cachingStorage.readStream('x', null)
    const reader = out.getReader()

    // Yield without reading — inner stream must not have been pre-drained
    await new Promise<void>((r) => setImmediate(r))
    expect(pullCount()).toBeLessThan(chunks.length)

    const first = await reader.read()
    expect(first.value).toEqual(new Uint8Array([0]))

    await reader.cancel()
  })

})

describe('apps/backend/lib/storage/FsStorage constructor and logging', () => {
  test('creates a missing root directory', async () => {
    const rootDir = path.join(os.tmpdir(), `logicle-storage-create-${Date.now()}`)
    await fs.promises.rm(rootDir, { recursive: true, force: true })
    const { FsStorage } = await import('@/backend/lib/storage/FsStorage')

    const storage = new FsStorage(rootDir)

    await expect(fs.promises.stat(rootDir)).resolves.toBeTruthy()
    expect(storage.rootPath).toBe(rootDir)
    await fs.promises.rm(rootDir, { recursive: true, force: true })
  })

  test('logs and rethrows when root directory creation fails', async () => {
    const infoSpy = vi.spyOn((await import('@/lib/logging')).logger, 'info').mockImplementation(() => {})
    const { FsStorage } = await import('@/backend/lib/storage/FsStorage')
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('mkdir failed')
    })

    expect(() => new FsStorage('/tmp/fail')).toThrow('mkdir failed')
    expect(infoSpy).toHaveBeenCalledWith('Failed creating file storage directory')
  })

  test('logs progress for files larger than one megabyte', async () => {
    const debugSpy = vi.spyOn((await import('@/lib/logging')).logger, 'debug').mockImplementation(() => {})
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'logicle-fs-storage-large-'))
    const { FsStorage } = await import('@/backend/lib/storage/FsStorage')
    const storage = new FsStorage(tempDir)
    const payload = Buffer.alloc(1024 * 1024 + 5, 8)

    await storage.writeStream('large.bin', bufferToReadableStream(payload), null)

    expect(debugSpy).toHaveBeenCalledWith(`Read ${1024 * 1024}`)
    expect(debugSpy).toHaveBeenCalledWith(`Total read = ${payload.length}`)
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })
})

describe('apps/backend/ee/PgpEncryptingStorage', () => {
  test('delegates rm to inner storage', async () => {
    const inner = new MemoryStorage()
    const rmSpy = vi.spyOn(inner, 'rm')
    const storage = await (await import('@/ee/PgpEncryptingStorage')).PgpEncryptingStorage.create(
      inner,
      password
    )

    await storage.rm('path-to-remove')

    expect(rmSpy).toHaveBeenCalledWith('path-to-remove')
  })
})

describe('apps/backend/ee/AeadEncryptingStorage', () => {
  async function makeAead() {
    const inner = new MemoryStorage()
    const { AeadEncryptingStorage } = await import('@/ee/AeadEncryptingStorage')
    const storage = await AeadEncryptingStorage.create(inner, password)
    return { inner, storage }
  }

  test('round-trips plaintext without a range', async () => {
    const { storage } = await makeAead()
    const plaintext = Buffer.from('hello AEAD world')

    await storage.writeBuffer('f', plaintext, 'aead')
    const result = await storage.readBuffer('f', 'aead')

    expect(result).toEqual(plaintext)
  })

  test('returns correct bytes for a sub-range within a single chunk', async () => {
    const { storage } = await makeAead()
    const plaintext = Buffer.from('abcdefghijklmnopqrstuvwxyz')

    await storage.writeBuffer('f', plaintext, 'aead')
    const result = await collectStreamToBuffer(
      await storage.readStream('f', 'aead', { rangeStart: 5, rangeEnd: 14 })
    )

    expect(result).toEqual(plaintext.subarray(5, 15))
  })

  test('returns correct bytes for a range spanning a chunk boundary', async () => {
    const { storage } = await makeAead()
    const CHUNK = 1024 * 1024
    const plaintext = Buffer.alloc(CHUNK + 512, 0xab)
    // make the two halves distinguishable
    plaintext.fill(0xcd, CHUNK - 8, CHUNK + 8)

    await storage.writeBuffer('large', plaintext, 'aead')

    const rangeStart = CHUNK - 8
    const rangeEnd = CHUNK + 7
    const result = await collectStreamToBuffer(
      await storage.readStream('large', 'aead', { rangeStart, rangeEnd })
    )

    expect(result).toEqual(plaintext.subarray(rangeStart, rangeEnd + 1))
  })

  test('round-trips an empty file', async () => {
    const { storage } = await makeAead()

    await storage.writeBuffer('empty', Buffer.alloc(0), 'aead')
    const result = await storage.readBuffer('empty', 'aead')

    expect(result).toEqual(Buffer.alloc(0))
  })

  test('throws for an out-of-bounds range', async () => {
    const { storage } = await makeAead()
    await storage.writeBuffer('f', Buffer.from('hello'), 'aead')

    await expect(
      storage.readStream('f', 'aead', { rangeStart: 0, rangeEnd: 5 })
    ).rejects.toThrow(/Invalid AEAD read range/)
  })

  test('passes range through to inner storage when encryption is null', async () => {
    const { inner, storage } = await makeAead()
    const data = Buffer.from('passthrough data')
    await inner.writeBuffer('raw', data, null)
    const readStreamSpy = vi.spyOn(inner, 'readStream')

    const result = await collectStreamToBuffer(
      await storage.readStream('raw', null, { rangeStart: 4, rangeEnd: 11 })
    )

    expect(result).toEqual(data.subarray(4, 12))
    expect(readStreamSpy).toHaveBeenCalledWith('raw', null, { rangeStart: 4, rangeEnd: 11 })
  })
})

describe('apps/backend/lib/storage/S3Storage', () => {
  test('covers constructor, reads, writes, and error handling', async () => {
    process.env.AWS_DEFAULT_REGION = 'eu-west-1'
    process.env.AWS_ACCESS_KEY_ID = 'key'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret'

    const send = vi.fn()
    const done = vi.fn()
    const info = vi.fn()
    const error = vi.fn()
    const uploadCalls: any[] = []
    const clientConfigs: any[] = []

    vi.doMock('@/lib/logging', () => ({
      logger: { info, error },
    }))
    vi.doMock('@aws-sdk/client-s3', () => ({
      S3Client: vi.fn().mockImplementation((config) => {
        clientConfigs.push(config)
        return { send }
      }),
      GetObjectCommand: vi.fn().mockImplementation((params) => ({ params })),
    }))
    vi.doMock('@aws-sdk/lib-storage', () => ({
      Upload: vi.fn().mockImplementation((config) => {
        uploadCalls.push(config)
        return { done }
      }),
    }))

    const { S3Storage } = await import('@/backend/lib/storage/S3Storage')

    const storage = new S3Storage('bucket-name')
    expect(storage.bucketName).toBe('bucket-name')
    expect(storage.region).toBe('eu-west-1')
    expect(storage.hostName).toBe('bucket-name.s3.eu-west-1.amazonaws.com')
    expect(clientConfigs[0]).toMatchObject({
      region: 'eu-west-1',
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    })

    await storage.writeStream('file.bin', bufferToReadableStream(Buffer.from('data')), null)
    expect(uploadCalls[0]).toMatchObject({
      client: { send },
      params: {
        Bucket: 'bucket-name',
        Key: 'file.bin',
      },
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
    })
    expect(info).toHaveBeenCalledWith('Successfully uploaded file.bin to bucket bucket-name')

    done.mockRejectedValueOnce(new Error('upload failed'))
    await expect(storage.writeStream('broken.bin', bufferToReadableStream(Buffer.from('x')), null)).rejects.toThrow(
      'upload failed'
    )
    expect(info).toHaveBeenCalledWith(
      'Failed to upload broken.bin to bucket bucket-name. Forwarding exception'
    )

    const transformToByteArray = vi.fn().mockResolvedValue(new Uint8Array([1]))
    send.mockResolvedValueOnce({ Body: { transformToByteArray } })
    await storage.rm('exists.bin')
    expect(transformToByteArray).toHaveBeenCalled()

    send.mockResolvedValueOnce({ Body: undefined })
    await expect(storage.rm('empty.bin')).resolves.toBeUndefined()

    const noSuchKey = new Error('missing')
    noSuchKey.name = 'NoSuchKey'
    send.mockRejectedValueOnce(noSuchKey)
    await expect(storage.rm('missing.bin')).resolves.toBeUndefined()
    expect(info).toHaveBeenCalledWith("Can't delete non existing object at missing.bin")

    const processError = new Error('process failed')
    send.mockRejectedValueOnce(processError)
    await expect(storage.rm('error.bin')).rejects.toThrow('process failed')
    expect(error).toHaveBeenCalledWith('Failed to process the S3 object at error.bin', processError)

    send.mockRejectedValueOnce('not-an-error')
    await expect(storage.rm('weird.bin')).rejects.toBe('not-an-error')

    const webStream = bufferToReadableStream(Buffer.from('downloaded'))
    send.mockResolvedValueOnce({
      Body: {
        transformToWebStream: vi.fn().mockReturnValue(webStream),
      },
    })
    await expect(collectStreamToBuffer(await storage.readStream('read.bin', null))).resolves.toEqual(
      Buffer.from('downloaded')
    )

    const rangeWebStream = bufferToReadableStream(Buffer.from('nged'))
    send.mockResolvedValueOnce({
      Body: {
        transformToWebStream: vi.fn().mockReturnValue(rangeWebStream),
      },
    })
    await expect(
      collectStreamToBuffer(await storage.readStream('range.bin', null, { rangeStart: 2, rangeEnd: 5 }))
    ).resolves.toEqual(Buffer.from('nged'))
    expect(send.mock.calls.at(-1)?.[0].params).toMatchObject({
      Bucket: 'bucket-name',
      Key: 'range.bin',
      Range: 'bytes=2-5',
    })

    send.mockResolvedValueOnce({ Body: undefined })
    await expect(storage.readStream('nobody.bin', null)).rejects.toThrow('Failed reading S3 object nobody.bin: No body')
    expect(error).toHaveBeenCalledWith('Failed reading S3 object', expect.any(Error))

    const readError = new Error('read failed')
    send.mockRejectedValueOnce(readError)
    await expect(storage.readStream('broken-read.bin', null)).rejects.toThrow('read failed')
    expect(error).toHaveBeenCalledWith('Failed reading S3 object', readError)
  })
})

describe('apps/backend/lib/storage/index', () => {
  test('builds fs+pgp+caching storage from env', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: '/tmp/storage',
          cacheSizeInMb: 4,
          encryptionProvider: 'pgp',
          encryptionKey: 'secret',
        },
      },
    }))

    const cachingInstances: any[] = []
    const fsInstances: any[] = []
    const pgpInstances: any[] = []
    const fakeFsStorage = { kind: 'fs' }
    const fakePgpStorage = { kind: 'pgp' }

    vi.doMock('@/lib/storage/FsStorage', () => ({
      FsStorage: vi.fn().mockImplementation((location) => {
        fsInstances.push(location)
        return fakeFsStorage
      }),
    }))
    vi.doMock('@/ee/PgpEncryptingStorage', () => ({
      PgpEncryptingStorage: {
        create: vi.fn().mockImplementation(async (storage, key) => {
          pgpInstances.push({ storage, key })
          return fakePgpStorage
        }),
      },
    }))
    vi.doMock('@/ee/AeadEncryptingStorage', () => ({
      AeadEncryptingStorage: {
        create: vi.fn(),
      },
    }))
    vi.doMock('@/lib/storage/CachingStorage', () => ({
      CachingStorage: vi.fn().mockImplementation((storage, size) => {
        const wrapped = { kind: 'cache', storage, size }
        cachingInstances.push(wrapped)
        return wrapped
      }),
    }))
    vi.doMock('@/lib/storage/S3Storage', () => ({
      S3Storage: vi.fn(),
    }))

    const module = await import('@/backend/lib/storage')

    expect(fsInstances).toEqual(['/tmp/storage'])
    expect(pgpInstances).toEqual([{ storage: fakeFsStorage, key: 'secret' }])
    expect(cachingInstances).toEqual([{ kind: 'cache', storage: fakePgpStorage, size: 4 }])
    expect(module.storage).toEqual(cachingInstances[0])
  })

  test('builds s3+pgp storage without cache from env', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: 's3://bucket-name',
          cacheSizeInMb: 0,
          encryptionProvider: 'pgp',
          encryptionKey: 'secret',
        },
      },
    }))

    const s3Instances: any[] = []
    const pgpInstances: any[] = []
    const fakeS3Storage = { kind: 's3' }
    const fakePgpStorage = { kind: 'pgp' }

    vi.doMock('@/lib/storage/S3Storage', () => ({
      S3Storage: vi.fn().mockImplementation((bucket) => {
        s3Instances.push(bucket)
        return fakeS3Storage
      }),
    }))
    vi.doMock('@/ee/PgpEncryptingStorage', () => ({
      PgpEncryptingStorage: {
        create: vi.fn().mockImplementation(async (storage, key) => {
          pgpInstances.push({ storage, key })
          return fakePgpStorage
        }),
      },
    }))
    vi.doMock('@/ee/AeadEncryptingStorage', () => ({
      AeadEncryptingStorage: {
        create: vi.fn(),
      },
    }))
    vi.doMock('@/lib/storage/CachingStorage', () => ({
      CachingStorage: vi.fn(),
    }))
    vi.doMock('@/lib/storage/FsStorage', () => ({
      FsStorage: vi.fn(),
    }))

    const module = await import('@/backend/lib/storage')

    expect(s3Instances).toEqual(['bucket-name'])
    expect(pgpInstances).toEqual([{ storage: fakeS3Storage, key: 'secret' }])
    expect(module.storage).toEqual(fakePgpStorage)
  })

  test('builds fs+pgp+aead storage from env', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: '/tmp/storage',
          cacheSizeInMb: 0,
          encryptionProvider: 'aead',
          encryptionKey: 'secret',
        },
      },
    }))

    const fsInstances: any[] = []
    const pgpInstances: any[] = []
    const aeadInstances: any[] = []
    const fakeFsStorage = { kind: 'fs' }
    const fakePgpStorage = { kind: 'pgp' }
    const fakeAeadStorage = { kind: 'aead' }

    vi.doMock('@/lib/storage/FsStorage', () => ({
      FsStorage: vi.fn().mockImplementation((location) => {
        fsInstances.push(location)
        return fakeFsStorage
      }),
    }))
    vi.doMock('@/ee/PgpEncryptingStorage', () => ({
      PgpEncryptingStorage: {
        create: vi.fn().mockImplementation(async (storage, key) => {
          pgpInstances.push({ storage, key })
          return fakePgpStorage
        }),
      },
    }))
    vi.doMock('@/ee/AeadEncryptingStorage', () => ({
      AeadEncryptingStorage: {
        create: vi.fn().mockImplementation(async (storage, key) => {
          aeadInstances.push({ storage, key })
          return fakeAeadStorage
        }),
      },
    }))
    vi.doMock('@/lib/storage/CachingStorage', () => ({
      CachingStorage: vi.fn(),
    }))
    vi.doMock('@/lib/storage/S3Storage', () => ({
      S3Storage: vi.fn(),
    }))

    const module = await import('@/backend/lib/storage')

    expect(fsInstances).toEqual(['/tmp/storage'])
    expect(pgpInstances).toEqual([{ storage: fakeFsStorage, key: 'secret' }])
    expect(aeadInstances).toEqual([{ storage: fakePgpStorage, key: 'secret' }])
    expect(module.storage).toEqual(fakeAeadStorage)
  })

  test('throws for missing storage location', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: '',
          cacheSizeInMb: 0,
          encryptionProvider: 'pgp',
          encryptionKey: 'secret',
        },
      },
    }))

    await expect(import('@/backend/lib/storage')).rejects.toThrow(
      'FILE_STORAGE_LOCATION not defined. Upload failing'
    )
  })

  test('throws for invalid s3 url', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: 's3://',
          cacheSizeInMb: 0,
          encryptionProvider: 'pgp',
          encryptionKey: 'secret',
        },
      },
    }))

    await expect(import('@/backend/lib/storage')).rejects.toThrow(
      'Invalid S3 URL. Must be in the format s3://bucket'
    )
  })
})
