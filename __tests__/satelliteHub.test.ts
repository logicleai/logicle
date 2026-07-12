import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// --- hoisted mocks ---

const {
  mockFindSatelliteAuthByApiKey,
  mockFindSatelliteBySecret,
  mockGetSatellite,
  mockCreateToolWithId,
  mockUpdateToolSatelliteInfo,
  mockDbExecuteTakeFirst,
} = vi.hoisted(() => ({
  mockFindSatelliteAuthByApiKey: vi.fn(),
  mockFindSatelliteBySecret: vi.fn(),
  mockGetSatellite: vi.fn(),
  mockCreateToolWithId: vi.fn().mockResolvedValue({ id: 'created-tool-id' }),
  mockUpdateToolSatelliteInfo: vi.fn().mockResolvedValue(undefined),
  mockDbExecuteTakeFirst: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/backend/api/utils/auth', () => ({
  findSatelliteAuthByApiKey: mockFindSatelliteAuthByApiKey,
  findSatelliteBySecret: mockFindSatelliteBySecret,
}))

vi.mock('@/models/satellite', () => ({
  getSatellite: mockGetSatellite,
}))

vi.mock('@/models/tool', () => ({
  createToolWithId: mockCreateToolWithId,
  updateToolSatelliteInfo: mockUpdateToolSatelliteInfo,
}))

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: mockDbExecuteTakeFirst }),
      }),
    }),
  },
}))

vi.mock('@/lib/satellite/events', () => ({
  satelliteEventBus: { publish: vi.fn() },
}))

// --- imports after mocks ---

import {
  hub,
  connections,
  handleSatelliteConnection,
  callSatelliteMethod,
} from '@/lib/satellite/hub'
import type { IncomingMessage } from 'node:http'

// --- helpers ---

/**
 * Minimal WebSocket stand-in: extends EventEmitter so we can trigger
 * 'message', 'close', and 'error' events, and records outbound sends.
 */
class MockWebSocket extends EventEmitter {
  readyState: number
  OPEN = 1
  sent: string[] = []
  closeCode?: number
  closeReason?: string

  constructor(open = true) {
    super()
    this.readyState = open ? 1 : 3 // 1 = OPEN, 3 = CLOSED
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code?: number, reason?: string) {
    this.closeCode = code
    this.closeReason = reason
  }
}

function makeReq(authorization = ''): IncomingMessage {
  return { headers: { authorization } } as unknown as IncomingMessage
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function validAuth(userId = 'user-1') {
  return { userId, scope: null }
}

function validSatellite(id: string, userId = 'user-1', name = 'My Satellite') {
  return { id, name, userId, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
}

const fakeUiLink = {
  debugMessage: vi.fn(),
  addCitations: vi.fn(),
  attachments: [],
  citations: [],
}

// --- tests ---

beforeEach(() => {
  connections.clear()
  hub.nextCallId = 1
  vi.clearAllMocks()
  mockFindSatelliteBySecret.mockResolvedValue(null) // no satellite secret match by default; falls through to the api key path
  mockCreateToolWithId.mockResolvedValue({ id: 'created-tool-id' })
  mockUpdateToolSatelliteInfo.mockResolvedValue(undefined)
  mockDbExecuteTakeFirst.mockResolvedValue(undefined) // no existing tool by default
})

/** Connect a registered satellite and flush the async registration. */
async function connectRegisteredSatellite(
  satelliteId = 'sat-1',
  tools: { name: string }[] = [],
  userId = 'user-1'
) {
  mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth(userId))
  mockGetSatellite.mockResolvedValue(validSatellite(satelliteId, userId))
  const ws = new MockWebSocket()
  await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))
  ws.emit('message', JSON.stringify({ type: 'register', satelliteId, name: 'ignored', tools }))
  await flushAsyncWork()
  return ws
}

// ─── handleSatelliteConnection ────────────────────────────────────────────────

describe('handleSatelliteConnection', () => {
  test('closes socket and does not process messages when unauthenticated', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(null)
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq())

    expect(ws.closeCode).toBe(1008)
    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'bot', tools: [] }))
    expect(connections.size).toBe(0)
  })

  test('attaches message/close/error listeners when authenticated', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    expect(ws.listenerCount('message')).toBe(1)
    expect(ws.listenerCount('close')).toBe(1)
    expect(ws.listenerCount('error')).toBe(1)
  })
})

// ─── register message ─────────────────────────────────────────────────────────

describe('register message', () => {
  test('registered satellite: adds connection to hub and sends registered response', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1', 'user-1', 'My Satellite'))
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'ignored', tools: [{ name: 'doThing' }] }))
    await flushAsyncWork()

    expect(connections.has('sat-1')).toBe(true)
    expect(connections.get('sat-1')!.tools).toEqual([{ name: 'doThing' }])
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'registered',
      satelliteId: 'sat-1',
      name: 'My Satellite', // comes from DB, not from the register message
    })
  })

  test('registered satellite: creates tool record on first connect', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    mockDbExecuteTakeFirst.mockResolvedValue(undefined) // no existing tool

    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))
    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'ignored', tools: [] }))
    await flushAsyncWork()

    expect(mockCreateToolWithId).toHaveBeenCalledOnce()
    expect(mockUpdateToolSatelliteInfo).toHaveBeenCalledWith('created-tool-id', 'sat-1', true)
  })

  test('registered satellite: updates existing tool record instead of creating a new one', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    mockDbExecuteTakeFirst.mockResolvedValue({ id: 'existing-tool-id' })

    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))
    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'ignored', tools: [] }))
    await flushAsyncWork()

    expect(mockCreateToolWithId).not.toHaveBeenCalled()
    expect(mockUpdateToolSatelliteInfo).toHaveBeenCalledWith('existing-tool-id', 'sat-1', true)
  })

  test('ephemeral satellite: does not create a tool record', async () => {
    // Regression: ephemeral connections used to call ensureSatelliteTool,
    // inserting a new orphaned Tool row on every reconnect because each
    // ephemeral session gets a fresh ephemeral_<nanoid> id.
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', name: 'my-bridge', tools: [] }))
    await flushAsyncWork()

    expect(mockCreateToolWithId).not.toHaveBeenCalled()
    expect(mockUpdateToolSatelliteInfo).not.toHaveBeenCalled()
  })

  test('ephemeral satellite: adds connection to hub with generated ephemeral id', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', name: 'my-bridge', tools: [{ name: 'fn' }] }))
    await flushAsyncWork()

    const entries = Array.from(connections.entries())
    expect(entries).toHaveLength(1)
    const [id, conn] = entries[0]
    expect(id).toMatch(/^ephemeral_/)
    expect(conn.name).toBe('my-bridge')
    expect(conn.tools).toEqual([{ name: 'fn' }])
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'registered', name: 'my-bridge' })
  })

  test('re-registration from same socket updates tools', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [{ name: 'a' }] }))
    await flushAsyncWork()
    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [{ name: 'b' }] }))
    await flushAsyncWork()

    expect(connections.get('sat-1')!.tools).toEqual([{ name: 'b' }])
  })

  test('rejects duplicate registration for an already-connected satelliteId', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))

    // First satellite connects successfully
    const ws1 = new MockWebSocket()
    await handleSatelliteConnection(ws1 as any, makeReq('Bearer valid-key'))
    ws1.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [] }))
    await flushAsyncWork()
    expect(connections.has('sat-1')).toBe(true)
    expect(connections.get('sat-1')!.socket).toBe(ws1)

    // Second satellite with same id is rejected
    const ws2 = new MockWebSocket()
    await handleSatelliteConnection(ws2 as any, makeReq('Bearer valid-key'))
    ws2.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [] }))
    await flushAsyncWork()

    expect(ws2.closeCode).toBe(1008)
    expect(ws2.closeReason).toBe('Satellite already connected')
    // First connection is untouched
    expect(connections.get('sat-1')!.socket).toBe(ws1)
  })

  test('rejects registration for unknown satellite id', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(undefined)
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'missing-id', name: 'sat', tools: [] }))
    await flushAsyncWork()

    expect(ws.closeCode).toBe(1008)
    expect(ws.closeReason).toBe('Satellite not found or unauthorized')
  })
})

// ─── satellite secret authentication ──────────────────────────────────────────

describe('satellite secret authentication', () => {
  test('registers using the authenticated satelliteId, satelliteId omitted from register message', async () => {
    mockFindSatelliteBySecret.mockResolvedValue({ userId: 'user-1', satelliteId: 'sat-1' })
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1', 'user-1', 'My Satellite'))
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer sat-1.secret'))

    ws.emit('message', JSON.stringify({ type: 'register', name: 'ignored', tools: [{ name: 'doThing' }] }))
    await flushAsyncWork()

    expect(mockFindSatelliteAuthByApiKey).not.toHaveBeenCalled()
    expect(connections.has('sat-1')).toBe(true)
    expect(connections.get('sat-1')!.tools).toEqual([{ name: 'doThing' }])
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'registered',
      satelliteId: 'sat-1',
      name: 'My Satellite',
    })
  })

  test('rejects when register satelliteId does not match the authenticated satellite', async () => {
    mockFindSatelliteBySecret.mockResolvedValue({ userId: 'user-1', satelliteId: 'sat-1' })
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer sat-1.secret'))

    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-2', name: 'sat', tools: [] }))
    await flushAsyncWork()

    expect(ws.closeCode).toBe(1008)
    expect(ws.closeReason).toBe('Satellite id mismatch')
    expect(connections.size).toBe(0)
  })

  test('falls back to api key auth when no satellite secret matches', async () => {
    mockFindSatelliteBySecret.mockResolvedValue(null)
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))

    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [] }))
    await flushAsyncWork()

    expect(connections.has('sat-1')).toBe(true)
  })
})

// ─── tool-result message ──────────────────────────────────────────────────────

describe('tool-result message', () => {
  test('resolves the matching pending call', async () => {
    const ws = await connectRegisteredSatellite('sat-1', [{ name: 'fn' }])

    const callPromise = callSatelliteMethod('sat-1', 'fn', fakeUiLink as any, { x: 1 })

    ws.emit('message', JSON.stringify({ type: 'tool-result', id: '1', content: [{ type: 'text', text: 'ok' }] }))

    const result = await callPromise
    expect(result).toMatchObject({ type: 'tool-result', id: '1' })
    expect(connections.get('sat-1')!.pendingCalls.size).toBe(0)
  })

  test('ignores tool-result for unknown call id', async () => {
    const ws = await connectRegisteredSatellite('sat-1', [{ name: 'fn' }])

    expect(() =>
      ws.emit('message', JSON.stringify({ type: 'tool-result', id: '999', content: [] }))
    ).not.toThrow()
  })
})

// ─── close handling ───────────────────────────────────────────────────────────

describe('close handling', () => {
  test('removes connection from hub on close', async () => {
    const ws = await connectRegisteredSatellite('sat-1')
    expect(connections.has('sat-1')).toBe(true)

    ws.emit('close')
    expect(connections.has('sat-1')).toBe(false)
  })

  test('rejects pending calls when satellite disconnects', async () => {
    const ws = await connectRegisteredSatellite('sat-1', [{ name: 'fn' }])

    const callPromise = callSatelliteMethod('sat-1', 'fn', fakeUiLink as any, {})
    ws.emit('close')

    await expect(callPromise).rejects.toThrow('Satellite disconnected')
  })
})

// ─── callSatelliteMethod ──────────────────────────────────────────────────────

describe('callSatelliteMethod', () => {
  test('throws when satellite is not connected', () => {
    expect(() => callSatelliteMethod('missing', 'fn', fakeUiLink as any, {})).toThrow(
      'Satellite "missing" is not connected'
    )
  })

  test('throws when method is not exposed by satellite', async () => {
    await connectRegisteredSatellite('sat-1', [])

    expect(() => callSatelliteMethod('sat-1', 'unknownFn', fakeUiLink as any, {})).toThrow(
      'Satellite "sat-1" does not expose method "unknownFn"'
    )
  })

  test('rejects immediately when socket is not open', async () => {
    mockFindSatelliteAuthByApiKey.mockResolvedValue(validAuth())
    mockGetSatellite.mockResolvedValue(validSatellite('sat-1'))
    const ws = new MockWebSocket(false) // not open
    await handleSatelliteConnection(ws as any, makeReq('Bearer valid-key'))
    ws.emit('message', JSON.stringify({ type: 'register', satelliteId: 'sat-1', name: 'sat', tools: [{ name: 'fn' }] }))
    await flushAsyncWork()

    await expect(callSatelliteMethod('sat-1', 'fn', fakeUiLink as any, {})).rejects.toThrow(
      'Satellite socket not open'
    )
    expect(connections.get('sat-1')!.pendingCalls.size).toBe(0)
  })

  test('sends serialised tool-call messages with incrementing ids', async () => {
    const ws = await connectRegisteredSatellite('sat-1', [{ name: 'fn' }])
    ws.sent = []

    callSatelliteMethod('sat-1', 'fn', fakeUiLink as any, { arg: 42 })
    callSatelliteMethod('sat-1', 'fn', fakeUiLink as any, { arg: 99 })

    expect(ws.sent).toHaveLength(2)
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'tool-call', id: '1', method: 'fn' })
    expect(JSON.parse(ws.sent[1])).toMatchObject({ type: 'tool-call', id: '2', method: 'fn' })
  })
})
