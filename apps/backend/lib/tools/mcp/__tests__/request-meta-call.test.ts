import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolFunction, ToolInvokeParams } from '@/lib/chat/tools'

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  buildMeta: vi.fn(),
  resolveOauth: vi.fn(),
}))

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: class {
    connect = mocks.connect
    listTools = mocks.listTools
    callTool = mocks.callTool
    close = vi.fn()
    ping = vi.fn()
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
  mocks.callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] })
  mocks.buildMeta.mockImplementation(async (params: ToolInvokeParams) => ({
    'logicle/messageId': params.requestContext?.messageId,
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
      _meta: { 'logicle/messageId': 'message-1' },
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
})
