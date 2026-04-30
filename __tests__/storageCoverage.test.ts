import { Readable } from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AesEncryptingStorage } from '@/ee/AesEncryptingStorage'
import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import {
  bufferToReadableStream,
  collectStreamToBuffer,
  nodeStreamToReadableStream,
} from '@/lib/storage/utils'

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
    await storage.writeBuffer('test', Buffer.from('value'), false)

    await storage.rm('test')

    expect(storage.map.test).toBeUndefined()
  })
})

describe('apps/backend/lib/storage/utils', () => {
  test('destroy node streams when web stream is cancelled', async () => {
    const nodeStream = new Readable({ read() {} })
    const destroySpy = vi.spyOn(nodeStream, 'destroy')
    const webStream = nodeStreamToReadableStream(nodeStream)

    await webStream.cancel()

    expect(destroySpy).toHaveBeenCalled()
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

    await storage.writeStream('large.bin', bufferToReadableStream(payload))

    expect(debugSpy).toHaveBeenCalledWith(`Read ${1024 * 1024}`)
    expect(debugSpy).toHaveBeenCalledWith(`Total read = ${payload.length}`)
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })
})

describe('apps/backend/ee/AesEncryptingStorage', () => {
  test('delegates rm to inner storage', async () => {
    const inner = new MemoryStorage()
    const rmSpy = vi.spyOn(inner, 'rm')
    const storage = await AesEncryptingStorage.create(inner, password)

    await storage.rm('path-to-remove')

    expect(rmSpy).toHaveBeenCalledWith('path-to-remove')
  })

  test('surfaces stream failures from encrypted processing', async () => {
    const storage = await AesEncryptingStorage.create(new MemoryStorage(), password)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.error(new Error('boom'))
      },
    })

    await expect(storage.writeStream('boom', stream, true)).rejects.toThrow('boom')
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
    expect(clientConfigs[0]).toEqual({
      region: 'eu-west-1',
      credentials: {
        accessKeyId: 'key',
        secretAccessKey: 'secret',
      },
    })

    await storage.writeStream('file.bin', bufferToReadableStream(Buffer.from('data')))
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
    await expect(storage.writeStream('broken.bin', bufferToReadableStream(Buffer.from('x')))).rejects.toThrow(
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
    await expect(collectStreamToBuffer(await storage.readStream('read.bin'))).resolves.toEqual(
      Buffer.from('downloaded')
    )

    send.mockResolvedValueOnce({ Body: undefined })
    await expect(storage.readStream('nobody.bin')).rejects.toThrow('Failed reading S3 object nobody.bin: No body')
    expect(error).toHaveBeenCalledWith('Failed reading S3 object', expect.any(Error))

    const readError = new Error('read failed')
    send.mockRejectedValueOnce(readError)
    await expect(storage.readStream('broken-read.bin')).rejects.toThrow('read failed')
    expect(error).toHaveBeenCalledWith('Failed reading S3 object', readError)
  })
})

describe('apps/backend/lib/storage/index', () => {
  test('builds fs+aes+caching storage from env', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: '/tmp/storage',
          cacheSizeInMb: 4,
          encryptionProvider: 'aes',
          encryptionKey: 'secret',
        },
      },
    }))

    const cachingInstances: any[] = []
    const fsInstances: any[] = []
    const aesInstances: any[] = []
    const fakeFsStorage = { kind: 'fs' }
    const fakeAesStorage = { kind: 'aes' }

    vi.doMock('@/lib/storage/FsStorage', () => ({
      FsStorage: vi.fn().mockImplementation((location) => {
        fsInstances.push(location)
        return fakeFsStorage
      }),
    }))
    vi.doMock('@/ee/AesEncryptingStorage', () => ({
      AesEncryptingStorage: {
        create: vi.fn().mockImplementation(async (storage, key) => {
          aesInstances.push({ storage, key })
          return fakeAesStorage
        }),
      },
    }))
    vi.doMock('@/ee/PgpEncryptingStorage', () => ({
      PgpEncryptingStorage: {
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
    expect(aesInstances).toEqual([{ storage: fakeFsStorage, key: 'secret' }])
    expect(cachingInstances).toEqual([{ kind: 'cache', storage: fakeAesStorage, size: 4 }])
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
    vi.doMock('@/ee/AesEncryptingStorage', () => ({
      AesEncryptingStorage: {
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

  test('throws for missing storage location', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        fileStorage: {
          location: '',
          cacheSizeInMb: 0,
          encryptionProvider: 'aes',
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
