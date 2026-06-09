import { describe, it, expect, vi, beforeEach } from 'vitest'
import WebSocket from 'ws'
import type { SatelliteConnection } from '@/lib/satellite/hub'

vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const makeConn = (overrides: Partial<SatelliteConnection>): SatelliteConnection => ({
  satelliteId: 'sat-1',
  kind: 'ephemeral',
  name: 'test-satellite',
  userId: 'user-1',
  tools: [{ name: 'fs_read', description: 'read a file' }],
  socket: {} as WebSocket,
  pendingCalls: new Map(),
  connectedAt: new Date(),
  ...overrides,
})

const mockConnections = new Map<string, SatelliteConnection>()

vi.mock('@/lib/satellite/hub', () => ({
  connections: mockConnections,
  callSatelliteMethod: vi.fn(),
}))

const dummyModel = { id: 'gpt-4', provider: 'openai' } as any
const context = { userId: 'user-1', assistantId: 'asst-1' }

async function callComputeFunctions(connections: SatelliteConnection[]) {
  mockConnections.clear()
  for (const c of connections) mockConnections.set(c.satelliteId, c)

  const { ChatAssistant } = await import('@/backend/lib/chat/index')
  return ChatAssistant.computeFunctions([], dummyModel, context)
}

describe('ChatAssistant.computeFunctions — satellite injection', () => {
  beforeEach(() => {
    vi.resetModules()
    mockConnections.clear()
  })

  it('injects tools from an ephemeral satellite belonging to the user', async () => {
    const conn = makeConn({ kind: 'ephemeral', userId: 'user-1' })
    mockConnections.set(conn.satelliteId, conn)

    const { ChatAssistant } = await import('@/backend/lib/chat/index')
    const { functions } = await ChatAssistant.computeFunctions([], dummyModel, context)

    expect(Object.keys(functions)).toContain('fs_read')
  })

  it('does not inject tools from a registered satellite', async () => {
    const conn = makeConn({ kind: 'registered', userId: 'user-1' })
    mockConnections.set(conn.satelliteId, conn)

    const { ChatAssistant } = await import('@/backend/lib/chat/index')
    const { functions } = await ChatAssistant.computeFunctions([], dummyModel, context)

    expect(Object.keys(functions)).not.toContain('fs_read')
  })

  it('does not inject tools from an ephemeral satellite of a different user', async () => {
    const conn = makeConn({ kind: 'ephemeral', userId: 'user-2' })
    mockConnections.set(conn.satelliteId, conn)

    const { ChatAssistant } = await import('@/backend/lib/chat/index')
    const { functions } = await ChatAssistant.computeFunctions([], dummyModel, context)

    expect(Object.keys(functions)).not.toContain('fs_read')
  })
})
