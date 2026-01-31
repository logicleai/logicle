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
      clientSecret: z.string().optional(),
      preferTopLevelNavigation: z.boolean().optional().default(false),
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
