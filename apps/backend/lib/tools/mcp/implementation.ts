import {
  ToolBuilder,
  ToolFunction,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import {
  McpInterface,
  McpPluginAuthentication,
  McpPluginParams,
  McpStdioPluginParams,
  isMcpStdioPluginParams,
  mcpPluginSchema,
} from '@/lib/tools/schemas'
import { JSONSchema7 } from 'json-schema'
import { logger } from '@/lib/logging'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { nanoid } from 'nanoid'
import env from '@/lib/env'
import { resolveMcpOAuthToken } from './oauth'
import type { ToolAuthParams } from '@/lib/chat/tools'
import { LlmModel } from '@/lib/chat/models'
import { LRUCache } from 'lru-cache'
import * as dto from '@/types/dto'
import { normalizeMcpToolResult, saveFile } from '@/backend/lib/tools/file-output-normalization'
import { prepareMcpConversationSandbox, type McpConversationSandbox } from './sandbox'
import { attachMcpFileBridge, type McpFileBridge } from './file-bridge'
import { SandboxedStdioClientTransport } from './sandboxed-stdio-transport'

interface CacheItem {
  id: string
  client: Client
  bridge?: McpFileBridge
  keepAlive?: NodeJS.Timeout
}

const clientCacheTtlMs = Math.max(0, env.tools.mcp.clientCacheTtlSeconds) * 1000
const clientCacheMaxItems = env.tools.mcp.clientCacheMaxItems
const keepAliveIntervalMs = Math.max(0, env.tools.mcp.keepAliveIntervalSeconds) * 1000
const clientCache = new LRUCache<string, CacheItem>({
  ttl: clientCacheTtlMs,
  max: clientCacheMaxItems,
  ttlAutopurge: false,
  updateAgeOnGet: true,
  dispose: (value) => {
    logger.info(`Disposing MCP client ${value.id}`)
    clearInterval(value.keepAlive)
    void value.client.close()
  },
})

// Cached clients can sit idle for minutes between tool invocations. Without
// traffic on the wire, an intermediary proxy (e.g. an nginx ingress with its
// default ~60s idle timeout) will silently kill the connection, so the next
// use fails or has to reconnect. Ping periodically to keep it warm.
const startKeepAlive = (key: string, client: Client): NodeJS.Timeout | undefined => {
  if (keepAliveIntervalMs <= 0) return undefined
  const timer = setInterval(() => {
    client.ping().catch((error) => {
      logger.warn(`MCP keep-alive ping failed for client at cache key ${key}`, error)
    })
  }, keepAliveIntervalMs)
  timer.unref?.()
  return timer
}

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

const createTransport = (
  params: McpPluginParams,
  accessToken?: string,
  sandbox?: McpConversationSandbox,
  bridgeRef?: { value?: McpFileBridge }
) => {
  if (isMcpStdioPluginParams(params)) {
    logger.info(`Create MCP stdio transport for command ${params.command}`)
    const env = sandbox
      ? {
          PATH: process.env.PATH ?? '',
          LANG: process.env.LANG ?? 'C.UTF-8',
          HOME: `${sandbox.workspaceDir}/home`,
          TMPDIR: `${sandbox.workspaceDir}/tmp`,
          MCP_SANDBOX_DIR: sandbox.workspaceDir,
          LOGICLE_MCP_SANDBOX: '1',
        }
      : undefined
    if (sandbox) {
      return new SandboxedStdioClientTransport({
        command: params.command,
        args: params.args,
        env,
        cwd: sandbox.workspaceDir,
        onFileBridge: (channel) => {
          bridgeRef!.value = attachMcpFileBridge(channel, sandbox)
        },
      })
    }
    const discoveryEnv = params.sandbox
      ? { ...process.env, LOGICLE_MCP_SANDBOX: '1' }
      : undefined
    return new StdioClientTransport({
      command: params.command,
      args: params.args,
      env: discoveryEnv,
      cwd: undefined,
    })
  }
  const { url, authentication } = params
  const headers = {
    ...computeHeaders(authentication, accessToken),
    ...(env.tenantId ? { 'x-tenant-id': env.tenantId } : {}),
  }
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
      reconnectionOptions: {
        maxReconnectionDelay: 30_000,
        initialReconnectionDelay: 1_000,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: env.tools.mcp.reconnectionMaxRetries,
      },
    })
  }
}

const getClient = async (
  params: McpPluginParams,
  accessToken?: string,
  cacheKeySuffix?: string,
  sandbox?: McpConversationSandbox
) => {
  const key = JSON.stringify({ params, accessToken, cacheKeySuffix })
  const cached = clientCache.get(key)
  if (cached) {
    return cached.client
  }
  const endpoint = isMcpStdioPluginParams(params) ? `stdio:${params.command}` : params.url
  logger.info(`Creating MCP client to ${endpoint}`)
  const client = new Client({
    name: 'example-client',
    version: '1.0.0',
  })
  const bridgeRef: { value?: McpFileBridge } = {}
  const transport = createTransport(params, accessToken, sandbox, bridgeRef)
  transport.onclose = () => {
    logger.info('MCP Transport closed')
    // A local stdio child can disappear independently, for example after its
    // binary is restarted. Never retain a client whose transport has closed.
    if (clientCache.get(key)?.client === client) {
      clientCache.delete(key)
    }
  }
  transport.onerror = (error) => {
    logger.error(
      `MCP Transport error, closing and removing from cache client for tool at ${endpoint}`,
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
  clientCache.set(key, { id, client, bridge: bridgeRef.value, keepAlive: startKeepAlive(key, client) })
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
      parameters: tool.inputSchema,
      auth: async () => null,
      invoke: async (invokeParams: ToolInvokeParams) => {
        const { params, userId, conversationId } = invokeParams
        let clientToUse = client
        let accessToken: string | undefined
        if (isMcpStdioPluginParams(toolParams) && toolParams.sandbox) {
          if (!conversationId) {
            return {
              type: 'error-text' as const,
              value: 'A conversation is required to use this sandboxed MCP tool.',
            }
          }
          try {
            const sandbox = await prepareMcpConversationSandbox(
              toolParams as McpStdioPluginParams,
              conversationId,
              userId,
            )
            if (sandbox) {
              clientToUse = await getClient(
                toolParams,
                undefined,
                `conversation:${conversationId}`,
                sandbox
              )
            }
          } catch (error) {
            logger.warn(`Failed preparing MCP sandbox for conversation ${conversationId}`, error)
            return {
              type: 'error-text' as const,
              value: error instanceof Error ? error.message : 'Failed preparing MCP sandbox.',
            }
          }
        }
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
          accessToken = resolution.accessToken
          clientToUse = await getClient(toolParams, accessToken, userId)
        }

        let result: Awaited<ReturnType<Client['callTool']>> | undefined
        const maxAttempts = 1 + Math.max(0, env.tools.mcp.callToolMaxRetries)
        let lastError: unknown
        let attempt = 0
        for (; attempt < maxAttempts; attempt++) {
          try {
            result = await clientToUse.callTool({
              name: tool.name,
              arguments: params,
            })
            lastError = undefined
            break
          } catch (e) {
            lastError = e
            logger.error(
              `MCP tool '${tool.name}' invocation failed (attempt ${attempt + 1}/${maxAttempts})`,
              e
            )
            if (attempt + 1 >= maxAttempts) break
            // The transport may have been torn down (e.g. an idle proxy closed the
            // connection mid-call); reconnect with a fresh client before retrying.
            clientToUse = await getClient(toolParams, accessToken, userId)
          }
        }
        if (lastError !== undefined) {
          const errorMessage =
            lastError instanceof Error ? lastError.message : 'MCP tool invocation failed'
          return { type: 'error-text' as const, value: errorMessage }
        }
        const normalized = await normalizeMcpToolResult(result!, invokeParams, {
          resolveResourceLinks: false,
        })
        const bridge = [...clientCache.values()].find((item) => item.client === clientToUse)?.bridge
        const artifacts = bridge?.takeArtifacts() ?? []
        if (artifacts.length === 0) return normalized
        const files = await Promise.all(artifacts.map((artifact) => saveFile({
          ...invokeParams,
          content: artifact.data,
          mimeType: artifact.mimeType,
          nameHint: artifact.name,
          source: 'MCP file bridge',
        })))
        if (normalized.type === 'content') {
          return { type: 'content' as const, value: [...normalized.value, ...files] }
        }
        return { type: 'content' as const, value: files }
      },
    }
  }

  return result
}

export class McpPlugin extends McpInterface implements ToolImplementation {
  static builder: ToolBuilder = async (toolParams: ToolParams, params: Record<string, unknown>) => {
    const config = mcpPluginSchema.parse(params)
    return new McpPlugin(toolParams, config)
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

  async functions(_model: LlmModel, context: ToolFunctionContext): Promise<ToolFunctions> {
    if (isMcpStdioPluginParams(this.config) && !this.toolParams.provisioned) {
      logger.warn(
        `Ignoring stdio MCP tool ${this.toolParams.id}: stdio is only available to provisioned tools`
      )
      return {}
    }
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

  async getAuthRequest(context: ToolFunctionContext): Promise<dto.UserRequest | null> {
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
