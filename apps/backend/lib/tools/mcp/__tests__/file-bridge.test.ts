import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Duplex } from 'node:stream'
import { McpFileBridge } from '../file-bridge'

const mockCanAccessFile = vi.fn()
const mockGetFileWithId = vi.fn()
const mockReadBuffer = vi.fn()

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))
vi.mock('@/models/file', () => ({
  getFileWithId: (...args: unknown[]) => mockGetFileWithId(...args),
}))
vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: (...args: unknown[]) => mockReadBuffer(...args) },
}))

class FakeChannel extends EventEmitter {
  written: (string | Buffer)[] = []
  writeReturnValue = true
  destroyed = false
  write(data: string | Buffer) {
    this.written.push(data)
    return this.writeReturnValue
  }
  destroy() {
    this.destroyed = true
  }
  writtenMessages(): Record<string, unknown>[] {
    return this.written
      .filter((w): w is string => typeof w === 'string')
      .map((w) => JSON.parse(w))
  }
}

function makeBridge(channel = new FakeChannel()) {
  const bridge = new McpFileBridge(channel as unknown as Duplex, {
    conversationId: 'c1',
    userId: 'u1',
  })
  return { bridge, channel }
}

/** Waits for the bridge's internal serialized task queue to drain. */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  mockCanAccessFile.mockReset()
  mockGetFileWithId.mockReset()
  mockReadBuffer.mockReset()
})

describe('McpFileBridge request framing', () => {
  it('replies with an error for a malformed JSON line', async () => {
    const { channel } = makeBridge()
    channel.emit('data', Buffer.from('not json\n'))
    await flush()

    expect(channel.writtenMessages()).toEqual([{ type: 'error', message: 'Invalid bridge request' }])
  })

  it('replies with an error for an unrecognized request type', async () => {
    const { channel } = makeBridge()
    channel.emit('data', Buffer.from(JSON.stringify({ type: 'ping', requestId: 'r1' }) + '\n'))
    await flush()

    expect(channel.writtenMessages()).toEqual([
      { type: 'error', requestId: 'r1', message: 'Invalid file request' },
    ])
  })

  it('buffers a request split across multiple data events', async () => {
    const { channel } = makeBridge()
    mockCanAccessFile.mockResolvedValue(false)
    const line = JSON.stringify({ type: 'read-file', id: 'file-1', requestId: 'r1' }) + '\n'
    channel.emit('data', Buffer.from(line.slice(0, 5)))
    channel.emit('data', Buffer.from(line.slice(5)))
    await flush()

    expect(channel.writtenMessages()).toEqual([
      { type: 'error', requestId: 'r1', message: 'File access denied' },
    ])
  })
})

describe('McpFileBridge read-file requests', () => {
  it('rejects a file id containing unsafe characters', async () => {
    const { channel } = makeBridge()
    channel.emit(
      'data',
      Buffer.from(JSON.stringify({ type: 'read-file', id: '../etc/passwd' }) + '\n')
    )
    await flush()

    expect(channel.writtenMessages()).toEqual([{ type: 'error', message: 'Invalid file request' }])
    expect(mockCanAccessFile).not.toHaveBeenCalled()
  })

  it('denies access the requesting user cannot read', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const { channel } = makeBridge()
    channel.emit('data', Buffer.from(JSON.stringify({ type: 'read-file', id: 'file-1' }) + '\n'))
    await flush()

    expect(mockCanAccessFile).toHaveBeenCalledWith({ userId: 'u1' }, 'file-1')
    expect(channel.writtenMessages()).toEqual([{ type: 'error', message: 'File access denied' }])
    expect(mockGetFileWithId).not.toHaveBeenCalled()
  })

  it('errors when the file does not exist', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue(undefined)
    const { channel } = makeBridge()
    channel.emit('data', Buffer.from(JSON.stringify({ type: 'read-file', id: 'file-1' }) + '\n'))
    await flush()

    expect(channel.writtenMessages()).toEqual([{ type: 'error', message: 'File not found' }])
  })

  it('streams the file header followed by its raw bytes', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue({ path: '/f', encryption: null, name: 'a.txt', type: 'text/plain' })
    mockReadBuffer.mockResolvedValue(Buffer.from('hello'))
    const { channel } = makeBridge()
    channel.emit(
      'data',
      Buffer.from(JSON.stringify({ type: 'read-file', id: 'file-1', requestId: 'r1' }) + '\n')
    )
    await flush()

    expect(mockReadBuffer).toHaveBeenCalledWith('/f', null)
    expect(channel.writtenMessages()).toEqual([
      { type: 'file', requestId: 'r1', name: 'a.txt', mimeType: 'text/plain', size: 5 },
    ])
    expect(channel.written[1]).toEqual(Buffer.from('hello'))
  })

  it('destroys the channel if handling the request throws', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue({ path: '/f', encryption: null, name: 'a.txt', type: 'text/plain' })
    mockReadBuffer.mockRejectedValue(new Error('disk error'))
    const { channel } = makeBridge()
    channel.emit('data', Buffer.from(JSON.stringify({ type: 'read-file', id: 'file-1' }) + '\n'))
    await flush()

    expect(channel.destroyed).toBe(true)
  })
})

describe('McpFileBridge publish-artifact requests', () => {
  it('buffers the declared number of raw bytes, acks, and exposes the artifact via takeArtifacts', async () => {
    const { bridge, channel } = makeBridge()
    const header =
      JSON.stringify({ type: 'publish-artifact', name: 'out.png', mimeType: 'image/png', size: 4, requestId: 'r9' }) +
      '\n'
    channel.emit('data', Buffer.from(header))
    channel.emit('data', Buffer.from([1, 2]))
    await flush()
    // Not yet acked: only 2 of the declared 4 bytes have arrived.
    expect(channel.writtenMessages()).toEqual([])

    channel.emit('data', Buffer.from([3, 4]))
    await flush()

    expect(channel.writtenMessages()).toEqual([{ type: 'artifact', requestId: 'r9' }])
    const artifacts = bridge.takeArtifacts()
    expect(artifacts).toEqual([{ name: 'out.png', mimeType: 'image/png', data: Buffer.from([1, 2, 3, 4]) }])
    // Draining clears the buffer.
    expect(bridge.takeArtifacts()).toEqual([])
  })

  it('treats an invalid publish-artifact header (bad size) as an unknown request', async () => {
    const { channel } = makeBridge()
    channel.emit(
      'data',
      Buffer.from(JSON.stringify({ type: 'publish-artifact', name: 'x', mimeType: 'x', size: -1 }) + '\n')
    )
    await flush()

    expect(channel.writtenMessages()).toEqual([{ type: 'error', message: 'Invalid file request' }])
  })

  it('processes a request that arrives right after an artifact payload in the same chunk', async () => {
    const { channel } = makeBridge()
    mockCanAccessFile.mockResolvedValue(false)
    const header =
      JSON.stringify({ type: 'publish-artifact', name: 'out.bin', mimeType: 'application/octet-stream', size: 2 }) +
      '\n'
    const nextRequest = JSON.stringify({ type: 'read-file', id: 'file-2', requestId: 'r2' }) + '\n'
    channel.emit('data', Buffer.concat([Buffer.from(header), Buffer.from([9, 9]), Buffer.from(nextRequest)]))
    await flush()

    expect(channel.writtenMessages()).toEqual([
      { type: 'artifact' },
      { type: 'error', requestId: 'r2', message: 'File access denied' },
    ])
  })
})

describe('McpFileBridge backpressure', () => {
  it('waits for a drain event before completing a write when the channel buffer is full', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const { channel } = makeBridge()
    channel.writeReturnValue = false
    channel.emit('data', Buffer.from(JSON.stringify({ type: 'read-file', id: 'file-1' }) + '\n'))

    // Give the microtask queue a couple of turns: the write is issued but not
    // yet acknowledged, so nothing should have advanced past it.
    await flush()
    expect(channel.written).toHaveLength(1)

    channel.emit('drain')
    await flush()
    expect(channel.written).toHaveLength(1)
  })
})
