import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

type Request = (
  method: string,
  path: string,
  options: {
    expectedStatus: number
    headers?: Record<string, string>
    json?: unknown
    timeoutMs?: number
    allowStatus?: number[]
  }
) => Promise<{ text: string }>

type Capture = { method: string; params?: Record<string, unknown> }

/** One real chat/auth/database/MCP wiring scenario; edge cases belong in unit tests. */
export async function checkMcpRequestContext(
  request: Request,
  login: (email: string, password: string) => Promise<void>,
  runId: string,
  adminEmail: string,
  password: string
) {
  console.log('Integration: MCP request context from an authenticated shared-assistant chat')
  const captures: Capture[] = []
  const sessions = new Set<Server>()
  const fixtureResult = `integration-mcp-result-${runId}`
  const fixture = createServer(async (req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    const server = new Server(
      { name: 'integration-mcp-context', version: '1.0.0' },
      { capabilities: { tools: {} } }
    )
    sessions.add(server)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.once('close', () => {
      sessions.delete(server)
      void server.close()
    })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'inspect',
          description: 'Integration test tool',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        },
      ],
    }))
    server.setRequestHandler(CallToolRequestSchema, async () => ({
      content: [{ type: 'text', text: fixtureResult }],
    }))
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      captures.push(body)
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch {
      // Do not print captured metadata or request bodies on fixture errors.
      if (!res.headersSent) res.writeHead(500).end()
      else res.destroy()
    }
  })

  const headers = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }
  const cleanupPaths: string[] = []
  let failure: unknown
  let conversationId: string | undefined
  const email = `mcp-context-${runId}@example.com`
  const userName = `Private MCP user ${runId}`
  const workspaceNames = ['eligible', 'user-only', 'assistant-only'].map(
    (scope) => `Private MCP ${scope} ${runId}`
  )
  const messageContent = `Private MCP message ${runId}`
  const messageId = `mcp-message-${runId}`
  const create = async (path: string, json: unknown) =>
    JSON.parse(
      (
        await request('POST', path, {
          expectedStatus: 201,
          headers,
          json,
          timeoutMs: 10000,
        })
      ).text
    )
  const remove = (path: string) =>
    request('DELETE', path, {
      expectedStatus: 204,
      headers,
      timeoutMs: 10000,
      // Published versions can keep an archived assistant's backend referenced.
      // These rows disappear with the disposable test database.
      allowStatus: path.startsWith('/api/backends/') ? [409] : undefined,
    })

  try {
    await new Promise<void>((resolve, reject) => {
      fixture.once('error', reject)
      fixture.listen(0, '0.0.0.0', resolve)
    })
    const address = fixture.address()
    assert(address && typeof address !== 'string')
    // When the backend runs in a container, advertise the runner's reachable hostname.
    const host = process.env.MCP_INTEGRATION_HOST ?? '127.0.0.1'
    const url = `http://${host}:${address.port}/mcp`

    const user = await create('/api/users', {
      name: userName,
      email,
      password,
      role: 'USER',
      ssoUser: false,
      preferences: '{}',
      image: null,
      properties: {},
    })
    cleanupPaths.push(`/api/users/${user.id}`)
    const backend = await create('/api/backends', {
      providerType: 'mock',
      name: `MCP context backend ${runId}`,
    })
    cleanupPaths.push(`/api/backends/${backend.id}`)
    const workspaceIds: string[] = []
    for (const name of workspaceNames) {
      const workspace = await create('/api/workspaces', { name })
      workspaceIds.push(workspace.id)
      cleanupPaths.push(`/api/workspaces/${workspace.id}`)
    }
    for (const [index, role] of [
      [0, 'EDITOR'],
      [1, 'MEMBER'],
    ] as const) {
      await request('POST', `/api/workspaces/${workspaceIds[index]}/members`, {
        expectedStatus: 204,
        headers,
        json: [{ userId: user.id, role }],
        timeoutMs: 10000,
      })
    }
    const tool = await create('/api/tools', {
      type: 'mcp',
      name: `MCP context tool ${runId}`,
      description: 'Integration fixture',
      configuration: { url, authentication: { type: 'none' } },
      tags: [],
      icon: null,
      sharing: { type: 'public' },
      promptFragment: '',
    })
    cleanupPaths.push(`/api/tools/${tool.id}`)
    const assistant = await create('/api/assistants', {
      backendId: backend.id,
      model: 'mock-echo',
      name: `MCP context assistant ${runId}`,
      description: 'MCP request context integration',
      systemPrompt: 'Use the inspect tool.',
      temperature: 0,
      tokenLimit: 4096,
      reasoning_effort: null,
      tags: [],
      prompts: [],
      tools: [tool.id],
      files: [],
      iconUri: null,
    })
    cleanupPaths.push(`/api/assistants/${assistant.assistantId}`)
    await request('POST', `/api/assistants/${assistant.assistantId}/publish`, {
      expectedStatus: 200,
      headers,
      json: {},
      timeoutMs: 10000,
    })
    await request('POST', `/api/assistants/${assistant.assistantId}/sharing`, {
      expectedStatus: 200,
      headers,
      timeoutMs: 10000,
      json: [0, 2].map((index) => ({
        type: 'workspace',
        workspaceId: workspaceIds[index],
        workspaceName: workspaceNames[index],
      })),
    })

    await login(email, password)
    const conversation = await create('/api/conversations', {
      assistantId: assistant.assistantId,
      name: 'MCP context integration chat',
    })
    conversationId = conversation.id
    await request('POST', '/api/chat', {
      expectedStatus: 200,
      headers: { ...headers, accept: 'text/event-stream' },
      timeoutMs: 15000,
      json: {
        id: messageId,
        conversationId,
        parent: null,
        role: 'user',
        content: messageContent,
        attachments: [],
      },
    })

    const calls = captures.filter((capture) => capture.method === 'tools/call')
    assert.equal(calls.length, 1, 'Expected exactly one MCP tool call')
    const params = calls[0].params!
    assert.equal(params.name, 'inspect')
    assert.deepEqual(params.arguments, {})
    const meta = params._meta as Record<string, unknown>
    assert(meta, 'MCP tool call must include metadata')
    assert.deepEqual(
      Object.fromEntries(Object.entries(meta).filter(([key]) => key.startsWith('logicle/'))),
      {
        'logicle/conversationId': conversationId,
        'logicle/messageId': messageId,
        'logicle/userId': user.id,
        'logicle/workspaceMemberships': [{ workspaceId: workspaceIds[0], role: 'EDITOR' }],
      }
    )
    for (const privateValue of [userName, email, password, messageContent, ...workspaceNames]) {
      assert(
        !JSON.stringify(meta).includes(privateValue),
        'Private fixture value leaked into metadata'
      )
    }
    assert(captures.some((capture) => capture.method === 'initialize'))
    assert(captures.some((capture) => capture.method === 'tools/list'))
    for (const capture of captures.filter((capture) => capture.method !== 'tools/call')) {
      const otherMeta = (capture.params?._meta ?? {}) as Record<string, unknown>
      assert(
        !Object.keys(otherMeta).some((key) => key.startsWith('logicle/')),
        'Chat context leaked into a non-tool request'
      )
    }
    const messages = JSON.parse(
      (
        await request('GET', `/api/conversations/${conversationId}/messages`, {
          expectedStatus: 200,
          headers,
          timeoutMs: 10000,
        })
      ).text
    ) as Array<{ role: string; parts?: Array<{ type: string; result?: unknown }> }>
    assert(
      messages.some(
        (message) =>
          message.role === 'tool' &&
          message.parts?.some(
            (part) =>
              part.type === 'tool-result' && JSON.stringify(part.result).includes(fixtureResult)
          )
      ),
      'MCP result was not persisted'
    )
  } catch (error) {
    failure = error
    throw error
  } finally {
    // Attempt every cleanup even when an earlier assertion or deletion fails.
    const cleanupErrors: unknown[] = []
    if (conversationId) {
      try {
        await remove(`/api/conversations/${conversationId}`)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    try {
      await login(adminEmail, password)
      for (const path of cleanupPaths.reverse()) {
        try {
          await remove(path)
        } catch (error) {
          cleanupErrors.push(error)
        }
      }
    } catch (error) {
      cleanupErrors.push(error)
    }
    await Promise.allSettled([...sessions].map((server) => server.close()))
    fixture.closeAllConnections()
    await new Promise<void>((resolve) => fixture.close(() => resolve()))
    captures.length = 0
    if (cleanupErrors.length) {
      if (!failure) throw new AggregateError(cleanupErrors, 'MCP integration cleanup failed')
      console.error(`MCP integration cleanup failed for ${cleanupErrors.length} operations`)
    }
  }
}
