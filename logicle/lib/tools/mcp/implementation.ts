import {
  ToolBuilder,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { McpInterface } from './interface'
import { JSONSchema7 } from 'json-schema'
import { logger } from '@/lib/logging'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

export interface McpPluginParams extends Record<string, unknown> {
  url: string
}

const clientCache = new Map<string, Client>()

async function getClient(url: string) {
  const cached = clientCache.get(url)
  if (cached) {
    return cached
  }
  const transport = new SSEClientTransport(new URL(url))
  logger.info(`Creating MCP client to ${url}`)
  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  })
  await client.connect(transport)
  clientCache.set(url, client)
  return client
}

async function convertMcpSpecToToolFunctions(toolParams: McpPluginParams): Promise<ToolFunctions> {
  const client = await getClient(toolParams.url)
  // List prompts
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
        return result
      },
    }
  }
  return result
}

export class McpPlugin extends McpInterface implements ToolImplementation {
  static builder: ToolBuilder = async (toolParams: ToolParams, params: Record<string, unknown>) => {
    const config = params as McpPluginParams
    const functions = await convertMcpSpecToToolFunctions(config)
    return new McpPlugin(toolParams, functions) // TODO: need a better validation
  }

  supportedMedia = []

  constructor(
    public toolParams: ToolParams,
    private functions_: ToolFunctions
  ) {
    super()
  }

  functions = () => this.functions_
}
