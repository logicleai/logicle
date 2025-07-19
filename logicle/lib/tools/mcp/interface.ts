import * as z from 'zod'

export interface McpParams {
  url: string
}

export const mcpPluginSchema = z.object({
  url: z.string().url(),
})

export class McpInterface {
  static toolName: string = 'mcp'
}
