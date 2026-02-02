import {
  ToolBuilder,
  ToolFunction,
  ToolFunctionContext,
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
import env from '@/lib/env'
import { resolveMcpOAuthToken } from './oauth'
import type { ToolAuthParams } from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import { LRUCache } from 'lru-cache'
import * as dto from '@/types/dto'

interface CacheItem {
  id: string
  client: Client
}

const clientCacheTtlMs = Math.max(0, env.tools.mcp.clientCacheTtlSeconds) * 1000
const clientCacheMaxItems = env.tools.mcp.clientCacheMaxItems
const clientCache = new LRUCache<string, CacheItem>({
  ttl: clientCacheTtlMs,
  max: clientCacheMaxItems,
  ttlAutopurge: false,
  updateAgeOnGet: true,
  dispose: (value) => {
    logger.info(`Disposing MCP client ${value.id}`)
    void value.client.close()
  },
})

if (clientCacheTtlMs > 0) {
  const sweepIntervalMs = Math.min(clientCacheTtlMs, 60_000)
  const sweep = setInterval(() => {
    clientCache.purgeStale()
  }, sweepIntervalMs)
  sweep.unref?.()
}

const computeHeaders = (
  authentication?: McpPluginAuthentication,
  accessToken?: string
): Record<string, string> => {
  if (!authentication || authentication.type === 'none') {
    return {}
  }
  if (authentication.type === 'bearer') {
    return { Authorization: `Bearer ${authentication.bearerToken}` }
  }
  if (authentication.type === 'oauth') {
    if (!accessToken) return {}
    return { Authorization: `Bearer ${accessToken}` }
  }
  return {}
}

const createTransport = ({ url, authentication }: McpPluginParams, accessToken?: string) => {
  const headers = computeHeaders(authentication, accessToken)
  if (url.endsWith('/sse')) {
    logger.info(`Create MCP SSE transport for url ${url}`)
    return new SSEClientTransport(new URL(url), {
      requestInit: {
        headers,
      },
    })
  } else {
    logger.info(`Create MCP streamable http transport for url ${url}`)
    return new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers,
      },
    })
  }
}

const getClient = async (
  params: McpPluginParams,
  accessToken?: string,
  cacheKeySuffix?: string
) => {
  const key = JSON.stringify({ params, accessToken, cacheKeySuffix })
  const cached = clientCache.get(key)
  if (cached) {
    return cached.client
  }
  logger.info(`Creating MCP client to ${params.url}`)
  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  })
  const transport = createTransport(params, accessToken)
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

async function convertMcpSpecToToolFunctions(
  toolParams: McpPluginParams,
  toolId: string,
  toolName: string,
  userId: string
): Promise<ToolFunctions> {
  let client: Client
  if (toolParams.authentication.type === 'oauth') {
    const resolution = await resolveMcpOAuthToken(
      userId,
      toolId,
      toolName,
      toolParams.authentication,
      toolParams.url
    )
    if (resolution.status !== 'ok') {
      return {}
    }
    client = await getClient(toolParams, resolution.accessToken, userId)
  } else {
    client = await getClient(toolParams)
  }
  const response = await client.listTools()
  const tools = response.tools
  const result: ToolFunctions = {}
  for (const tool_ of tools) {
    const tool = tool_ as any
    result[tool.name] = {
      description: tool.description ?? '',
      // the code below is highly unsafe... but it's a start
      parameters: tool.inputSchema as JSONSchema7,
      auth: async () => null,
      invoke: async (invokeParams: ToolInvokeParams) => {
        const { params, userId } = invokeParams
        let clientToUse = client
        if (toolParams.authentication.type === 'oauth') {
          if (!userId) {
            return {
              type: 'error-text',
              value: 'MCP credentials missing. Please enable the tool first.',
            }
          }
          const resolution = await resolveMcpOAuthToken(
            userId,
            toolId,
            toolName,
            toolParams.authentication,
            toolParams.url
          )
          if (resolution.status !== 'ok') {
            return {
              type: 'error-text',
              value:
                resolution.status === 'unreadable'
                  ? 'Stored MCP credentials are unreadable. Please re-enable the tool.'
                  : 'MCP credentials missing or expired. Please enable the tool.',
            }
          }
          clientToUse = await getClient(toolParams, resolution.accessToken, userId)
        }
        const result = await clientToUse.callTool({
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
  private enableTool: ToolFunction

  constructor(
    public toolParams: ToolParams,
    private config: McpPluginParams
  ) {
    super()
    this.enableTool = this.createEnableTool(this.toolParams.name)
  }

  getConfig(): McpPluginParams {
    return this.config
  }

  async functions(_model: LlmModel, context?: ToolFunctionContext): Promise<ToolFunctions> {
    const userId = context?.userId ?? ''
    if (
      this.config.authentication.type === 'oauth' &&
      this.config.authentication.activationMode === 'lazy'
    ) {
      const resolution = await resolveMcpOAuthToken(
        userId,
        this.toolParams.id,
        this.toolParams.name,
        this.config.authentication,
        this.config.url
      )
      if (resolution.status !== 'ok') {
        return { enable: this.enableTool }
      }
    }
    return await convertMcpSpecToToolFunctions(
      this.config,
      this.toolParams.id,
      this.toolParams.name,
      userId
    )
  }

  async getAuthRequest(context?: ToolFunctionContext): Promise<dto.UserRequest | null> {
    if (this.config.authentication.type !== 'oauth') return null
    if ((this.config.authentication.activationMode ?? 'preflight') !== 'preflight') {
      return null
    }
    const userId = context?.userId
    let resolution: Awaited<ReturnType<typeof resolveMcpOAuthToken>>
    if (!userId) {
      resolution = { status: 'missing' }
    } else {
      try {
        resolution = await resolveMcpOAuthToken(
          userId,
          this.toolParams.id,
          this.toolParams.name,
          this.config.authentication,
          this.config.url
        )
      } catch {
        resolution = { status: 'missing' }
      }
    }
    if (resolution.status === 'ok') return null
    return {
      type: 'mcp-oauth',
      toolId: this.toolParams.id,
      toolName: this.toolParams.name,
      authorizationUrl: `${env.appUrl}/api/mcp/oauth/start?toolId=${this.toolParams.id}`,
      topLevelNavigation: this.config.authentication.preferTopLevelNavigation ?? false,
      status: resolution.status,
      message: userId ? undefined : 'User session required for MCP OAuth',
    }
  }

  private createEnableTool(toolName: string): ToolFunction {
    const toolId = this.toolParams.id
    return {
      description: `Enable MCP tool ${toolName} access by completing OAuth.`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      } as JSONSchema7,
      auth: async (authParams: ToolAuthParams) => {
        if (this.config.authentication.type !== 'oauth') return null
        if (!authParams.userId) {
          return {
            type: 'mcp-oauth',
            toolId,
            toolName,
            authorizationUrl: `${env.appUrl}/api/mcp/oauth/start?toolId=${toolId}`,
            topLevelNavigation: this.config.authentication.preferTopLevelNavigation ?? false,
            status: 'missing',
            message: 'User session required for MCP OAuth',
            pendingAction: {
              toolCall: {
                toolCallId: authParams.toolCallId,
                toolName: authParams.toolName,
                args: authParams.params,
              },
              result: { type: 'json', value: { status: 'ok' } },
            },
          } satisfies dto.McpOAuthUserRequest
        }
        const resolution = await resolveMcpOAuthToken(
          authParams.userId,
          toolId,
          toolName,
          this.config.authentication,
          this.config.url
        )
        if (resolution.status !== 'ok') {
          return {
            type: 'mcp-oauth',
            toolId,
            toolName,
            authorizationUrl: `${env.appUrl}/api/mcp/oauth/start?toolId=${toolId}`,
            topLevelNavigation: this.config.authentication.preferTopLevelNavigation ?? false,
            status: resolution.status,
            pendingAction: {
              toolCall: {
                toolCallId: authParams.toolCallId,
                toolName: authParams.toolName,
                args: authParams.params,
              },
              result: { type: 'json', value: { status: 'ok' } },
            },
          } satisfies dto.McpOAuthUserRequest
        }
        return null
      },
      invoke: async () => ({
        type: 'json',
        value: { status: 'ok' },
      }),
    }
  }
}
