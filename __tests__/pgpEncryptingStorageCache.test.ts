import { beforeEach, describe, expect, test, vi } from 'vitest'
import { BaseStorage } from '@/lib/storage/api'
import { PgpEncryptingStorage, setPgpS2kWorker } from '@/ee/PgpEncryptingStorage'

const { readMessageMock, decryptMock } = vi.hoisted(() => ({
  readMessageMock: vi.fn(),
  decryptMock: vi.fn(),
}))

vi.mock('openpgp', () => ({
  readMessage: readMessageMock,
  decrypt: decryptMock,
  decryptSessionKeys: vi.fn(),
  encrypt: vi.fn(),
  createMessage: vi.fn(),
}))

class StaticStorage extends BaseStorage {
  constructor(private readonly payload: Uint8Array) {
    super()
  }

  async readStream(): Promise<ReadableStream<Uint8Array>> {
    const payload = this.payload
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload.subarray(0, 32))
        controller.enqueue(payload.subarray(32))
        controller.close()
      },
    })
  }

  async writeStream(): Promise<void> {}

  async rm(): Promise<void> {}
}

function makeSessionKey() {
  return { algorithm: 'aes256', data: new Uint8Array([1, 2, 3, 4]) }
}

function makeClearStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

describe('PgpEncryptingStorage session key promise cache failure handling', () => {
  beforeEach(() => {
    readMessageMock.mockReset()
    decryptMock.mockReset()
    readMessageMock.mockResolvedValue({})
    decryptMock.mockResolvedValue({ data: makeClearStream() })
  })

  test('evicts failed cached promise so next request can retry', async () => {
    const deriveSessionKey = vi
      .fn()
      .mockRejectedValueOnce(new Error('s2k failed'))
      .mockResolvedValueOnce(makeSessionKey())
    setPgpS2kWorker({ deriveSessionKey } as any)

    const storage = await PgpEncryptingStorage.create(
      new StaticStorage(new Uint8Array(128).fill(7)),
      'passphrase'
    )

    await expect(storage.readStream('file-a', true)).rejects.toThrow('s2k failed')
    await expect(storage.readStream('file-a', true)).resolves.toBeInstanceOf(ReadableStream)

    expect(deriveSessionKey).toHaveBeenCalledTimes(2)
    expect(readMessageMock).toHaveBeenCalledTimes(1)
    expect(decryptMock).toHaveBeenCalledTimes(1)
  })

  test('shares one failing in-flight promise across concurrent reads, then retries cleanly', async () => {
    let rejectFirst: (error: Error) => void = () => {}
    const firstFailure = new Promise<ReturnType<typeof makeSessionKey>>((_, reject) => {
      rejectFirst = reject
    })

    const deriveSessionKey = vi.fn().mockReturnValueOnce(firstFailure).mockResolvedValue(makeSessionKey())
    setPgpS2kWorker({ deriveSessionKey } as any)

    const storage = await PgpEncryptingStorage.create(
      new StaticStorage(new Uint8Array(128).fill(9)),
      'passphrase'
    )

    const firstRead = storage.readStream('file-b', true)
    const secondRead = storage.readStream('file-b', true)
    rejectFirst(new Error('shared failure'))

    const [firstResult, secondResult] = await Promise.allSettled([firstRead, secondRead])
    expect(firstResult.status).toBe('rejected')
    expect(secondResult.status).toBe('rejected')
    expect(deriveSessionKey).toHaveBeenCalledTimes(1)

    await expect(storage.readStream('file-b', true)).resolves.toBeInstanceOf(ReadableStream)
    expect(deriveSessionKey).toHaveBeenCalledTimes(2)
    expect(readMessageMock).toHaveBeenCalledTimes(1)
    expect(decryptMock).toHaveBeenCalledTimes(1)
  })
})
