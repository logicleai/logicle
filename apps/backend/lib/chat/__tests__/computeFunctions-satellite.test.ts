import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import WebSocket from 'ws'
import type { SatelliteConnection } from '@/lib/satellite/hub'
import type { ToolFunctions, ToolImplementation } from '@/lib/chat/tools'

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
const originalPrefixToolNames = process.env.PREFIX_FUNCTION_NAMES

const functionDefinition = {
  description: '',
  invoke: async () => ({ type: 'text', value: '' }),
} as any

const makeToolImplementation = (
  id: string,
  name: string,
  functions: ToolFunctions
): ToolImplementation => ({
  supportedMedia: [],
  toolParams: { id, name, provisioned: true, promptFragment: '' },
  functions: async () => functions,
})

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
    delete process.env.PREFIX_FUNCTION_NAMES
  })

  afterAll(() => {
    if (originalPrefixToolNames === undefined) {
      delete process.env.PREFIX_FUNCTION_NAMES
    } else {
      process.env.PREFIX_FUNCTION_NAMES = originalPrefixToolNames
    }
  })

  it('injects tools from an ephemeral satellite belonging to the user', async () => {
    const conn = makeConn({ kind: 'ephemeral', userId: 'user-1' })
    mockConnections.set(conn.satelliteId, conn)

    const { ChatAssistant } = await import('@/backend/lib/chat/index')
    const { functions } = await ChatAssistant.computeFunctions([], dummyModel, context)

    expect(Object.keys(functions)).toContain('test-satellite__fs_read')
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

  it('uses bare function names when PREFIX_FUNCTION_NAMES is disabled', async () => {
    process.env.PREFIX_FUNCTION_NAMES = '0'
    const conn = makeConn({
      name: 'Studio Sat! 42',
      tools: [{ name: 'read file', description: 'read a file' }],
    })

    const { functions, functionToolIdMap } = await callComputeFunctions([conn])

    expect(Object.keys(functions)).toEqual(['read file'])
    expect(functionToolIdMap.get('read file')).toBe('sat-1')
  })

  it('prefixes and sanitizes tool names by default', async () => {
    const conn = makeConn({
      name: 'Studio Sat! 42',
      tools: [{ name: 'read file', description: 'read a file' }],
    })

    const { functions, functionToolIdMap } = await callComputeFunctions([conn])

    expect(Object.keys(functions)).toEqual(['Studio_Sat_42__read_file'])
    expect(functionToolIdMap.get('Studio_Sat_42__read_file')).toBe('sat-1')
  })

  it('prefixes all tool names to disambiguate duplicates by default', async () => {
    const toolA = makeToolImplementation('tool-a', 'A Tool', { readFile: functionDefinition })
    const toolB = makeToolImplementation('tool-b', 'B Tool', { readFile: functionDefinition })

    const { ChatAssistant } = await import('@/backend/lib/chat/index')
    const { functions, functionToolIdMap } = await ChatAssistant.computeFunctions(
      [toolA, toolB],
      dummyModel,
      context
    )

    expect(Object.keys(functions).sort()).toEqual(['A_Tool__readFile', 'B_Tool__readFile'])
    expect(functionToolIdMap.get('A_Tool__readFile')).toBe('tool-a')
    expect(functionToolIdMap.get('B_Tool__readFile')).toBe('tool-b')
  })
})
