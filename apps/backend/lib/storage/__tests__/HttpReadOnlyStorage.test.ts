import { afterEach, describe, expect, test, vi } from 'vitest'
import { HttpReadOnlyStorage } from '../HttpReadOnlyStorage'

afterEach(() => vi.unstubAllGlobals())

describe('HttpReadOnlyStorage', () => {
  test('forwards closed byte ranges to the read-only proxy', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(new Uint8Array(64), {
          status: 206,
          headers: { 'content-range': 'bytes 0-63/100' },
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const storage = new HttpReadOnlyStorage('https://proxy.example/prefix/', 'Bearer test')

    expect(storage.supportsRangeReads('aead')).toBe(true)
    await storage.readStream('folder/a file.bin', 'aead', { rangeStart: 0, rangeEnd: 63 })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://proxy.example/prefix/folder/a%20file.bin')
    const headers = new Headers(init?.headers)
    expect(headers.get('range')).toBe('bytes=0-63')
    expect(headers.get('authorization')).toBe('Bearer test')
    expect(init?.redirect).toBe('error')
  })

  test('rejects a partial range instead of accidentally downloading the whole blob', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const storage = new HttpReadOnlyStorage('https://proxy.example/')

    await expect(storage.readStream('blob.bin', 'aead', { rangeStart: 0 })).rejects.toThrow(
      'require both rangeStart and rangeEnd'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('rejects a proxy that ignores a requested byte range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    )
    const storage = new HttpReadOnlyStorage('https://proxy.example/')

    await expect(
      storage.readStream('blob.bin', 'aead', { rangeStart: 0, rangeEnd: 1 })
    ).rejects.toThrow('expected HTTP 206, got 200')
  })

  test('rejects a mismatched Content-Range', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2]), {
            status: 206,
            headers: { 'content-range': 'bytes 4-5/100' },
          })
      )
    )
    const storage = new HttpReadOnlyStorage('https://proxy.example/')

    await expect(
      storage.readStream('blob.bin', 'aead', { rangeStart: 0, rangeEnd: 1 })
    ).rejects.toThrow('invalid Content-Range')
  })
})
