import {
  ToolBuilder,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { McpInterface, McpPluginAuthentication, McpPluginParams } from './interface'
import { JSONSchema7 } from 'json-schema'
import { logger } from '@/lib/logging'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { nanoid } from 'nanoid'
import { JSONValue } from 'ai'

interface CacheItem {
  id: string
  client: Client
}

const clientCache = new Map<string, CacheItem>()

const computeHeaders = (authentication?: McpPluginAuthentication): Record<string, string> => {
  if (!authentication || authentication.type === 'none') {
    return {}
  } else {
    return { Authorization: `Bearer ${authentication.bearerToken}` }
  }
}

const createTransport = ({ url, authentication }: McpPluginParams) => {
  const headers = computeHeaders(authentication)
  if (url.endsWith('/sse')) {
    logger.info(`Create MCP SSE transport for url ${url}`)
    return new SSEClientTransport(new URL(url))
  } else {
    logger.info(`Create MCP streamable http transport for url ${url}`)
    return new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers,
      },
    })
  }
}

const getClient = async (params: McpPluginParams) => {
  const key = JSON.stringify(params)
  const cached = clientCache.get(key)
  if (cached) {
    return cached.client
  }
  logger.info(`Creating MCP client to ${params.url}`)
  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  })
  const transport = createTransport(params)
  transport.onclose = () => {
    logger.info('MCP Transport closed')
  }
  transport.onerror = (error) => {
    logger.error(
      `MCP Transport error, closing and removing from cache client for tool at ${params.url}`,
      error
    )
    void client.close()
    clientCache.delete(key)
  }
  try {
    await client.connect(transport)
  } catch (e) {
    logger.error(`Failed connecting to MCP server@${params.url}`, e)
    throw e
  }
  const id = nanoid()
  clientCache.set(key, { id, client })
  return client
}

async function convertMcpSpecToToolFunctions(toolParams: McpPluginParams): Promise<ToolFunctions> {
  const client = await getClient(toolParams)
  const response = await client.listTools()
  const tools = response.tools
  const result: ToolFunctions = {}
  for (const tool_ of tools) {
    const tool = tool_ as any
    result[tool.name] = {
      description: tool.description ?? '',
      // the code below is highly unsafe... but it's a start
      parameters: tool.inputSchema as JSONSchema7,
      invoke: async ({ params }: ToolInvokeParams) => {
        const result = await client.callTool({
          name: tool.name,
          arguments: params,
        })
        return {
          type: 'json',
          value: result as JSONValue,
        }
      },
    }
  }
  return result
}

export class McpPlugin extends McpInterface implements ToolImplementation {
  static builder: ToolBuilder = async (toolParams: ToolParams, params: Record<string, unknown>) => {
    const config = params as McpPluginParams
    return new McpPlugin(toolParams, config) // TODO: need a better validation
  }

  supportedMedia = []

  constructor(
    public toolParams: ToolParams,
    private config: McpPluginParams
  ) {
    super()
  }

  functions(): Promise<ToolFunctions> {
    return convertMcpSpecToToolFunctions(this.config)
  }
}
