import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const { connections, callSatelliteMethod, membershipQueries } = vi.hoisted(() => ({
  connections: new Map<string, any>(),
  callSatelliteMethod: vi.fn(),
  membershipQueries: [] as Array<Record<string, string>>,
}))

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: () => {
      const filters: Record<string, string> = {}
      membershipQueries.push(filters)
      const query = {
        innerJoin: () => query,
        select: () => query,
        where: (column: string, _operator: string, value: string) => {
          filters[column] = value
          return query
        },
        execute: async () => [
          { workspaceId: `workspace-${filters['WorkspaceMember.userId']}`, role: 'EDITOR' },
        ],
      }
      return query
    },
  },
}))

vi.mock('@/lib/satellite/hub', () => ({
  connections,
  callSatelliteMethod,
}))

const toolParams: ToolParams = {
  id: 'sat-1',
  provisioned: false,
  promptFragment: '',
  name: 'My Satellite',
}

describe('SatelliteTool.functions', () => {
  test('returns callable functions for the satellite connection owner', async () => {
    connections.clear()
    connections.set('sat-1', {
      satelliteId: 'sat-1',
      userId: 'owner',
      kind: 'registered',
      tools: [{ name: 'do_thing', description: 'does a thing' }],
    })

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    const fns = await tool.functions({} as any, { userId: 'owner' })
    expect(Object.keys(fns)).toEqual(['do_thing'])
  })

  test('allows a user who can access the shared Satellite tool', async () => {
    connections.clear()
    connections.set('sat-1', {
      satelliteId: 'sat-1',
      userId: 'owner',
      kind: 'registered',
      tools: [{ name: 'do_thing', description: 'does a thing' }],
    })

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    await expect(tool.functions({} as any, { userId: 'attacker' })).resolves.toHaveProperty(
      'do_thing'
    )
  })

  test('rejects when the satellite is not connected at all', async () => {
    connections.clear()

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    await expect(tool.functions({} as any, { userId: 'owner' })).rejects.toThrow(
      /currently offline/
    )
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  membershipQueries.length = 0
  callSatelliteMethod.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
})

test('builds isolated root metadata for shared satellite calls and preserves arguments', async () => {
  connections.clear()
  connections.set('sat-1', { tools: [{ name: 'do_thing', description: 'does a thing' }] })
  const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
  const tool = new SatelliteTool(toolParams, 'sat-1')
  const functions = await tool.functions({} as any, { userId: 'owner' })
  if (!('invoke' in functions.do_thing)) throw new Error('Missing callable tool')
  const invoke = functions.do_thing.invoke
  const makeParams = (userId: string): ToolInvokeParams => ({
    llmModel: {} as any,
    messages: [],
    assistantId: 'child-assistant',
    userId: 'fallback-user',
    conversationId: 'fallback-conversation',
    requestContext: {
      userId,
      conversationId: `conversation-${userId}`,
      messageId: `message-${userId}`,
    },
    requestMeta: { traceId: `trace-${userId}`, 'logicle/messageId': 'stale' },
    params: { input: userId, _meta: 'ordinary-tool-argument' },
    uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
  })
  const first = makeParams('user-a')
  const second = makeParams('user-b')
  expect(await Promise.all([invoke(first), invoke(second)])).toEqual(
    Array(2).fill({ type: 'content', value: [{ type: 'text', text: 'done' }] })
  )
  for (const [index, params] of [first, second].entries()) {
    const userId = params.requestContext!.userId!
    expect(callSatelliteMethod.mock.calls[index]).toEqual([
      'sat-1',
      'do_thing',
      params.uiLink,
      params.params,
      {
        traceId: `trace-${userId}`,
        'logicle/conversationId': `conversation-${userId}`,
        'logicle/messageId': `message-${userId}`,
        'logicle/userId': userId,
        'logicle/workspaceMemberships': [{ workspaceId: `workspace-${userId}`, role: 'EDITOR' }],
      },
    ])
    expect(membershipQueries[index]).toEqual({
      'WorkspaceMember.userId': userId,
      'AssistantSharing.assistantId': 'child-assistant',
    })
    expect(params.requestMeta!['logicle/messageId']).toBe('stale')
    expect(params.params._meta).toBe('ordinary-tool-argument')
  }
})
