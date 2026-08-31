import { describe, expect, test, vi, beforeEach } from 'vitest'

const undiciFetchMock = vi.fn()

vi.mock('undici', () => ({
  Agent: vi.fn().mockImplementation(() => ({})),
  fetch: undiciFetchMock,
}))

describe('IP range blocking', () => {
  test('blocks loopback, private, link-local and cloud-metadata IPv4 addresses', async () => {
    const { __testing } = await import('../safeFetch')
    const blocked = [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
      '100.64.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]
    for (const ip of blocked) {
      expect(__testing.isBlockedIPv4(ip)).toBe(true)
    }
  })

  test('allows ordinary public IPv4 addresses', async () => {
    const { __testing } = await import('../safeFetch')
    expect(__testing.isBlockedIPv4('8.8.8.8')).toBe(false)
    expect(__testing.isBlockedIPv4('1.1.1.1')).toBe(false)
  })

  test('blocks loopback, unique-local, link-local and IPv4-mapped private IPv6 addresses', async () => {
    const { __testing } = await import('../safeFetch')
    expect(__testing.isBlockedIPv6('::1')).toBe(true)
    expect(__testing.isBlockedIPv6('fe80::1')).toBe(true)
    expect(__testing.isBlockedIPv6('fc00::1')).toBe(true)
    expect(__testing.isBlockedIPv6('::ffff:127.0.0.1')).toBe(true)
    expect(__testing.isBlockedIPv6('::ffff:169.254.169.254')).toBe(true)
  })

  test('allows an ordinary public IPv6 address', async () => {
    const { __testing } = await import('../safeFetch')
    expect(__testing.isBlockedIPv6('2606:4700:4700::1111')).toBe(false)
  })
})

describe('safeFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('rejects non-http(s) protocols before making any request', async () => {
    const { safeFetch } = await import('../safeFetch')
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(/non-http/)
    expect(undiciFetchMock).not.toHaveBeenCalled()
  })

  test('rejects a literal loopback IP before making any request', async () => {
    const { safeFetch } = await import('../safeFetch')
    await expect(safeFetch('http://127.0.0.1/secret')).rejects.toThrow(/non-public/)
    expect(undiciFetchMock).not.toHaveBeenCalled()
  })

  test('rejects a literal cloud-metadata IP before making any request', async () => {
    const { safeFetch } = await import('../safeFetch')
    await expect(safeFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/non-public/)
    expect(undiciFetchMock).not.toHaveBeenCalled()
  })

  test('enforces the maximum response size and cancels the stream', async () => {
    const cancel = vi.fn()
    const chunk = new Uint8Array(1024)
    let reads = 0
    const reader = {
      read: vi.fn(async () => {
        reads += 1
        if (reads > 3) return { done: true, value: undefined }
        return { done: false, value: chunk }
      }),
      cancel,
    }
    undiciFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    })

    const { safeFetch } = await import('../safeFetch')
    await expect(safeFetch('http://example.com/big', { maxBytes: 2000 })).rejects.toThrow(
      /exceeded the maximum allowed size/
    )
    expect(cancel).toHaveBeenCalled()
  })

  test('returns the concatenated body when under the size limit', async () => {
    const part1 = new Uint8Array([1, 2, 3])
    const part2 = new Uint8Array([4, 5])
    let reads = 0
    const reader = {
      read: vi.fn(async () => {
        reads += 1
        if (reads === 1) return { done: false, value: part1 }
        if (reads === 2) return { done: false, value: part2 }
        return { done: true, value: undefined }
      }),
      cancel: vi.fn(),
    }
    undiciFetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => reader },
    })

    const { safeFetch } = await import('../safeFetch')
    const result = await safeFetch('http://example.com/small')
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3, 4, 5]))
  })

  test('throws when the response is not ok', async () => {
    undiciFetchMock.mockResolvedValue({ ok: false, status: 404 })
    const { safeFetch } = await import('../safeFetch')
    await expect(safeFetch('http://example.com/missing')).rejects.toThrow(/HTTP 404/)
  })
})
