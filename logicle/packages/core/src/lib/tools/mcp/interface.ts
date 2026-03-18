import * as z from 'zod'

export const mcpAuthenticationSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('none'),
    }),
    z.object({
      type: z.literal('bearer'),
      bearerToken: z.string(),
    }),
    z.object({
      type: z.literal('oauth'),
      clientId: z.preprocess(
        (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
        z.string().min(1).optional()
      ),
      clientSecret: z.string().optional().describe('secret'),
      preferTopLevelNavigation: z.boolean().optional().default(false),
      activationMode: z.enum(['preflight', 'lazy']).optional().default('preflight'),
    }),
  ])
  .default({ type: 'none' })

export const mcpPluginSchema = z.object({
  url: z.string().url(),
  authentication: mcpAuthenticationSchema,
})

export type McpPluginAuthentication = z.infer<typeof mcpAuthenticationSchema>

export type McpPluginParams = z.infer<typeof mcpPluginSchema>

export class McpInterface {
  static toolName: string = 'mcp'
}

export type McpToolAvailability = 'ok' | 'require-auth'

const normalizeMcpConfig = (config: unknown) => {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config)
    } catch {
      return undefined
    }
  }
  return config
}

export const getMcpToolAvailability = (
  config: unknown,
  hasReadableSecret: boolean
): McpToolAvailability => {
  const parsed = mcpPluginSchema.safeParse(normalizeMcpConfig(config))
  if (!parsed.success) {
    return 'require-auth'
  }
  if (parsed.data.authentication.type !== 'oauth') {
    return 'ok'
  }
  return hasReadableSecret ? 'ok' : 'require-auth'
}
