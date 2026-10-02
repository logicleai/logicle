import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolFunction, ToolInvokeParams } from '@/lib/chat/tools'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  ping: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  buildMeta: vi.fn(),
  resolveOauth: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    private transport?: { onclose?: () => void }
    connect = async (transport: { onclose?: () => void }) => {
      this.transport = transport
      return mocks.connect(transport)
    }
    listTools = mocks.listTools
    callTool = mocks.callTool
    close = () => {
      mocks.close()
      this.transport?.onclose?.()
    }
    ping = mocks.ping
  },
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {},
}))
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class {} }))
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class {} }))
vi.mock('../request-meta', () => ({ buildMcpRequestMeta: mocks.buildMeta }))
vi.mock('../oauth', () => ({ resolveMcpOAuthToken: mocks.resolveOauth }))
vi.mock('@/backend/lib/tools/file-output-normalization', () => ({
  normalizeMcpToolResult: async () => ({ type: 'text', value: 'ok' }),
  saveFile: vi.fn(),
}))

import { McpPlugin } from '../implementation'

let nextToolId = 0
const toolParams = () => ({
  id: `meta-test-${++nextToolId}`,
  name: 'Metadata inspector',
  promptFragment: '',
  provisioned: false,
})

const invokeParams = (messageId: string) =>
  ({
    params: {},
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1',
    requestContext: { conversationId: 'conversation-1', messageId, userId: 'user-1' },
    messages: [],
  }) as unknown as ToolInvokeParams

const getTool = async (authentication: Record<string, unknown> = { type: 'none' }) => {
  const id = toolParams()
  const plugin = new McpPlugin(id, {
    url: `http://metadata-test.invalid/${id.id}`,
    authentication,
  } as never)
  const functions = await plugin.functions({} as never, {
    userId: 'user-1',
  })
  return functions.inspect as ToolFunction
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listTools.mockResolvedValue({
    tools: [{ name: 'inspect', inputSchema: { type: 'object', properties: {} } }],
  })
  mocks.ping.mockResolvedValue({})
  mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
  mocks.buildMeta.mockImplementation(async (params: ToolInvokeParams) => ({
    ...params.requestMeta,
    'logicle/conversationId': params.requestContext?.conversationId,
    'logicle/messageId': params.requestContext?.messageId,
    'logicle/userId': params.requestContext?.userId,
  }))
  mocks.resolveOauth.mockResolvedValue({ status: 'ok', accessToken: 'test-token' })
})

describe('MCP tools/call metadata', () => {
  it('keeps metadata outside model-generated arguments and off tool discovery', async () => {
    const tool = await getTool()
    const params = invokeParams('message-1')
    params.params = { query: 'example' }

    await tool.invoke(params)

    expect(mocks.listTools).toHaveBeenCalledWith()
    expect(mocks.callTool).toHaveBeenCalledWith({
      name: 'inspect',
      arguments: { query: 'example' },
      _meta: {
        'logicle/conversationId': 'conversation-1',
        'logicle/messageId': 'message-1',
        'logicle/userId': 'user-1',
      },
    })
  })

  it('uses one metadata snapshot across a transport retry', async () => {
    const tool = await getTool()
    mocks.callTool.mockRejectedValueOnce(new Error('connection closed'))

    await tool.invoke(invokeParams('message-1'))

    expect(mocks.buildMeta).toHaveBeenCalledTimes(1)
    expect(mocks.callTool).toHaveBeenCalledTimes(2)
    expect(mocks.callTool.mock.calls[0][0]._meta).toBe(mocks.callTool.mock.calls[1][0]._meta)
  })

  it('keeps concurrent calls separate, including with an OAuth client', async () => {
    const tool = await getTool({ type: 'oauth', activationMode: 'preflight' })

    await Promise.all([
      tool.invoke(invokeParams('message-1')),
      tool.invoke(invokeParams('message-2')),
    ])

    expect(mocks.resolveOauth).toHaveBeenCalled()
    expect(
      mocks.callTool.mock.calls.map(([request]) => request._meta['logicle/messageId'])
    ).toEqual(['message-1', 'message-2'])
  })

  it.each([{ type: 'none' }, { type: 'oauth', activationMode: 'preflight' }])(
    'isolates overlapping users and conversations with $type authentication',
    async (authentication) => {
      const tool = await getTool(authentication)
      let enterFirst!: () => void
      let releaseFirst!: () => void
      const firstEntered = new Promise<void>((resolve) => {
        enterFirst = resolve
      })
      const firstReleased = new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      mocks.callTool.mockImplementationOnce(async () => {
        enterFirst()
        await firstReleased
        return { content: [{ type: 'text', text: 'ok' }] }
      })
      const firstParams = invokeParams('message-1')
      firstParams.params = { query: 'first' }
      firstParams.requestMeta = { traceId: 'trace-1' }
      const secondParams = invokeParams('message-2')
      secondParams.userId = 'user-2'
      secondParams.conversationId = 'conversation-2'
      secondParams.requestContext = {
        conversationId: 'conversation-2',
        messageId: 'message-2',
        userId: 'user-2',
      }
      secondParams.params = { query: 'second' }
      secondParams.requestMeta = { traceId: 'trace-2' }

      const firstCall = tool.invoke(firstParams)
      await firstEntered
      try {
        await tool.invoke(secondParams)
      } finally {
        releaseFirst()
        await firstCall
      }
      expect(mocks.callTool.mock.calls.map(([call]) => call)).toEqual([
        {
          name: 'inspect',
          arguments: { query: 'first' },
          _meta: {
            traceId: 'trace-1',
            'logicle/conversationId': 'conversation-1',
            'logicle/messageId': 'message-1',
            'logicle/userId': 'user-1',
          },
        },
        {
          name: 'inspect',
          arguments: { query: 'second' },
          _meta: {
            traceId: 'trace-2',
            'logicle/conversationId': 'conversation-2',
            'logicle/messageId': 'message-2',
            'logicle/userId': 'user-2',
          },
        },
      ])
      if (authentication.type === 'none') {
        expect(mocks.connect).toHaveBeenCalledTimes(1)
      } else {
        expect(mocks.resolveOauth.mock.calls.map((args) => args.length)).toEqual([5, 5, 5])
        expect(mocks.resolveOauth.mock.calls.map(([userId]) => userId)).toEqual([
          'user-1',
          'user-1',
          'user-2',
        ])
        // OAuth receives credential-resolution inputs only, never chat context.
        for (const args of mocks.resolveOauth.mock.calls) {
          expect(JSON.stringify(args)).not.toMatch(/message-[12]|conversation-[12]|trace-[12]/)
        }
      }
      expect(mocks.buildMeta).toHaveBeenCalledTimes(2)
    }
  )

  it('retains the retry snapshot despite changed memberships and refreshes it on the next call', async () => {
    const tool = await getTool()
    let role = 'MEMBER'
    mocks.buildMeta.mockImplementation(async (params: ToolInvokeParams) => ({
      'logicle/messageId': params.requestContext?.messageId,
      'logicle/workspaceMemberships': [{ workspaceId: 'workspace-1', role }],
    }))
    mocks.callTool.mockImplementationOnce(async () => {
      role = 'EDITOR'
      throw new Error('connection closed')
    })

    await tool.invoke(invokeParams('message-1'))
    await tool.invoke(invokeParams('message-2'))

    expect(mocks.buildMeta).toHaveBeenCalledTimes(2)
    const requests = mocks.callTool.mock.calls.map(([call]) => call)
    expect(requests[0]._meta).toBe(requests[1]._meta)
    expect(requests.map((call) => call._meta['logicle/workspaceMemberships'][0].role)).toEqual([
      'MEMBER',
      'MEMBER',
      'EDITOR',
    ])
    expect(requests.map((call) => call._meta['logicle/messageId'])).toEqual([
      'message-1',
      'message-1',
      'message-2',
    ])
  })

  it('keeps the same originating message for multiple calls and changes it on a new turn', async () => {
    const tool = await getTool()
    await tool.invoke(invokeParams('message-1'))
    await tool.invoke(invokeParams('message-1'))
    await tool.invoke(invokeParams('message-2'))
    expect(mocks.callTool.mock.calls.map(([call]) => call._meta['logicle/messageId'])).toEqual([
      'message-1',
      'message-1',
      'message-2',
    ])
  })

  it('does not attach chat metadata to initialization, discovery, or keep-alive pings', async () => {
    vi.useFakeTimers()
    try {
      const tool = await getTool()
      await tool.invoke(invokeParams('message-1'))
      await vi.advanceTimersByTimeAsync(30000)
      expect(mocks.connect).toHaveBeenCalledTimes(1)
      expect(mocks.connect.mock.calls[0]).toHaveLength(1)
      expect(mocks.connect.mock.calls[0][0]).not.toHaveProperty('_meta')
      expect(mocks.listTools.mock.calls).toEqual([[]])
      expect(mocks.ping.mock.calls).toEqual([[]])
      expect(mocks.buildMeta).toHaveBeenCalledTimes(1)
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('removes a closed cached client before disposal and reconnects without recursive deletion', async () => {
    const id = toolParams()
    const plugin = new McpPlugin(id, {
      url: `http://metadata-test.invalid/${id.id}`,
      authentication: { type: 'none' },
    } as never)
    await plugin.functions({} as never, { userId: 'user-1' })
    const transport = mocks.connect.mock.calls[0][0]

    // Real Client.close() fires onclose synchronously, including during disposal.
    expect(() => transport.onclose()).not.toThrow()
    expect(mocks.close).toHaveBeenCalledTimes(1)
    const functions = await plugin.functions({} as never, { userId: 'user-1' })
    await (functions.inspect as ToolFunction).invoke(invokeParams('new-message'))
    expect(mocks.connect).toHaveBeenCalledTimes(2)
    expect(mocks.callTool.mock.calls[0][0]._meta['logicle/messageId']).toBe('new-message')
  })
})
