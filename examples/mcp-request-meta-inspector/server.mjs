import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const host = '127.0.0.1'
const port = Number(process.env.MCP_INSPECTOR_PORT ?? 8765)
let failNextCall = process.env.MCP_INSPECTOR_FAIL_ONCE === '1'

const printCall = (request, outcome) => {
  console.log(
    JSON.stringify(
      {
        method: request.method,
        tool: request.params.name,
        argumentKeys: Object.keys(request.params.arguments ?? {}),
        _meta: request.params._meta ?? null,
        outcome,
      },
      null,
      2
    )
  )
}

const httpServer = createServer(async (req, res) => {
  if (req.url !== '/mcp') {
    res.writeHead(404).end()
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405).end()
    return
  }

  let body
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    res.writeHead(400).end()
    return
  }

  if (failNextCall && body.method === 'tools/call') {
    failNextCall = false
    printCall(body, 'forced_disconnect')
    res.destroy()
    return
  }

  const server = new Server(
    { name: 'logicle-request-meta-inspector', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'show_request_context',
        description:
          'Show the context Logicle sends with this MCP call. Use when asked to inspect MCP metadata.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    printCall(request, 'success')
    return {
      content: [{ type: 'text', text: 'Request metadata printed in the inspector terminal.' }],
    }
  })

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.once('close', () => {
    void transport.close()
    void server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (error) {
    console.error('MCP request failed:', error)
    if (!res.headersSent) res.writeHead(500).end()
  }
})

httpServer.listen(port, host, () => {
  console.log(`MCP request metadata inspector listening on http://${host}:${port}/mcp`)
})
