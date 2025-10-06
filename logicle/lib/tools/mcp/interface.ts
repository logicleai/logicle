import * as z from 'zod'

export interface McpPluginNoAuthorization {
  type: 'none'
}

export interface McpPluginBearerTokenAuthorization {
  type: 'bearer'
  bearerToken: string
}

export type McpPluginAuthentication = McpPluginBearerTokenAuthorization | McpPluginNoAuthorization

export interface McpPluginParams extends Record<string, unknown> {
  url: string
  authentication?: McpPluginAuthentication
}

export const mcpPluginSchema = z.object({
  url: z.string().url(),
  authentication: z.any().optional(),
})

export class McpInterface {
  static toolName: string = 'mcp'
}
