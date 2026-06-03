import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EventEmitter } from 'node:events'

// --- hoisted mocks ---

const { mockAuthenticateWithAuthorizationHeader } = vi.hoisted(() => ({
  mockAuthenticateWithAuthorizationHeader: vi.fn(),
}))
const { mockGetTool } = vi.hoisted(() => ({
  mockGetTool: vi.fn(),
}))

vi.mock('@/backend/api/utils/auth', () => ({
  authenticateWithAuthorizationHeader: mockAuthenticateWithAuthorizationHeader,
}))
vi.mock('@/models/tool', () => ({
  getTool: mockGetTool,
}))

// --- imports after mocks ---

import {
  hub,
  connections,
  handleSatelliteConnection,
  callSatelliteMethod,
} from '@/lib/satellite/hub'
import type { IncomingMessage } from 'node:http'
import { UserRole } from '@/types/dto'
import { SatelliteInterface } from '@/lib/tools/schemas'

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

function adminAuthResult() {
  return { success: true, value: { userRole: UserRole.ADMIN, userId: 'user-admin' } }
}

function nonAdminAuthResult() {
  return { success: true, value: { userRole: UserRole.USER, userId: 'user-regular' } }
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
  mockGetTool.mockResolvedValue({
    id: 'sat-tool-id',
    type: SatelliteInterface.toolName,
  })
})

// TODO: rewrite tests for new satellite authentication flow
// The new flow uses findSatelliteAuthByApiKey and getSatellite instead of
// authenticateWithAuthorizationHeader, and returns different types
// describe('checkSatelliteAuthentication', () => { ... })

// ─── handleSatelliteConnection ────────────────────────────────────────────────

describe('handleSatelliteConnection', () => {
  test('closes socket and does not process messages when unauthenticated', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue({ success: false })
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq())

    expect(ws.closeCode).toBe(1008)
    // The buffering listener is removed after auth fails; a subsequent 'message'
    // event should not register the satellite.
    ws.emit(
      'message',
      JSON.stringify({ type: 'register', satelliteId: 'sat-tool-id', name: 'bot', tools: [] })
    )
    expect(connections.size).toBe(0)
  })

  test('attaches message/close/error listeners when authenticated', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))

    expect(ws.listenerCount('message')).toBe(1)
    expect(ws.listenerCount('close')).toBe(1)
    expect(ws.listenerCount('error')).toBe(1)
  })
})

// ─── register message ─────────────────────────────────────────────────────────

describe('register message', () => {
  test('adds connection to hub', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'my-sat',
        tools: [{ name: 'doThing' }],
      })
    )
    await flushAsyncWork()

    expect(connections.has('sat-tool-id')).toBe(true)
    expect(connections.get('sat-tool-id')!.tools).toEqual([{ name: 'doThing' }])
    expect(JSON.parse(ws.sent[0])).toEqual({
      type: 'registered',
      satelliteId: 'sat-tool-id',
      name: 'my-sat',
    })
  })

  test('re-registration overwrites existing entry', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'a' }],
      })
    )
    await flushAsyncWork()
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'b' }],
      })
    )
    await flushAsyncWork()

    expect(connections.get('sat-tool-id')!.tools).toEqual([{ name: 'b' }])
  })

  test('rejects registration for unknown satellite tool id', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    mockGetTool.mockResolvedValue(undefined)
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))

    ws.emit(
      'message',
      JSON.stringify({ type: 'register', satelliteId: 'missing-id', name: 'sat', tools: [] })
    )
    await flushAsyncWork()

    expect(ws.closeCode).toBe(1008)
    expect(ws.closeReason).toBe('Unknown satellite id')
  })
})

// ─── tool-result message ──────────────────────────────────────────────────────

describe('tool-result message', () => {
  test('resolves the matching pending call', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'fn' }],
      })
    )
    await flushAsyncWork()

    const callPromise = callSatelliteMethod('sat-tool-id', 'fn', fakeUiLink as any, { x: 1 })

    ws.emit(
      'message',
      JSON.stringify({ type: 'tool-result', id: '1', content: [{ type: 'text', text: 'ok' }] })
    )

    const result = await callPromise
    expect(result).toMatchObject({ type: 'tool-result', id: '1' })
    expect(connections.get('sat-tool-id')!.pendingCalls.size).toBe(0)
  })

  test('ignores tool-result for unknown call id', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'fn' }],
      })
    )
    await flushAsyncWork()

    // no pending call — should not throw
    expect(() =>
      ws.emit('message', JSON.stringify({ type: 'tool-result', id: '999', content: [] }))
    ).not.toThrow()
  })
})

// ─── close handling ───────────────────────────────────────────────────────────

describe('close handling', () => {
  test('removes connection from hub on close', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({ type: 'register', satelliteId: 'sat-tool-id', name: 'sat', tools: [] })
    )
    await flushAsyncWork()
    expect(connections.has('sat-tool-id')).toBe(true)

    ws.emit('close')
    expect(connections.has('sat-tool-id')).toBe(false)
  })

  test('rejects pending calls when satellite disconnects', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'fn' }],
      })
    )
    await flushAsyncWork()

    const callPromise = callSatelliteMethod('sat-tool-id', 'fn', fakeUiLink as any, {})
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
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({ type: 'register', satelliteId: 'sat-tool-id', name: 'sat', tools: [] })
    )
    await flushAsyncWork()

    expect(() => callSatelliteMethod('sat-tool-id', 'unknownFn', fakeUiLink as any, {})).toThrow(
      'Satellite "sat-tool-id" does not expose method "unknownFn"'
    )
  })

  test('rejects immediately when socket is not open', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket(false) // not open
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'fn' }],
      })
    )
    await flushAsyncWork()

    await expect(callSatelliteMethod('sat-tool-id', 'fn', fakeUiLink as any, {})).rejects.toThrow(
      'Satellite socket not open'
    )
    expect(connections.get('sat-tool-id')!.pendingCalls.size).toBe(0)
  })

  test('sends serialised tool-call message with incrementing id', async () => {
    mockAuthenticateWithAuthorizationHeader.mockResolvedValue(adminAuthResult())
    const ws = new MockWebSocket()
    await handleSatelliteConnection(ws as any, makeReq('Bearer token'))
    ws.emit(
      'message',
      JSON.stringify({
        type: 'register',
        satelliteId: 'sat-tool-id',
        name: 'sat',
        tools: [{ name: 'fn' }],
      })
    )
    await flushAsyncWork()
    ws.sent = []

    callSatelliteMethod('sat-tool-id', 'fn', fakeUiLink as any, { arg: 42 })
    callSatelliteMethod('sat-tool-id', 'fn', fakeUiLink as any, { arg: 99 })

    expect(ws.sent).toHaveLength(2)
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'tool-call', id: '1', method: 'fn' })
    expect(JSON.parse(ws.sent[1])).toMatchObject({ type: 'tool-call', id: '2', method: 'fn' })
  })
})
