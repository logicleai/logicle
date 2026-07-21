import { describe, expect, test } from 'vitest'
import { McpPlugin } from '@/backend/lib/tools/mcp/implementation'
import { mcpPluginSchema } from '@/lib/tools/schemas'

const stdioConfig = {
  transport: 'stdio' as const,
  url: 'stdio://local' as const,
  command: 'mcp-file-analyzer',
  args: ['--example'],
  authentication: { type: 'none' as const },
}

describe('stdio MCP tools', () => {
  test('accepts a command and argument list', () => {
    expect(mcpPluginSchema.parse(stdioConfig)).toEqual(stdioConfig)
  })

  test('does not expose an unprovisioned stdio tool', async () => {
    const plugin = new McpPlugin(
      {
        id: 'local-mcp',
        name: 'Local MCP',
        promptFragment: '',
        provisioned: false,
      },
      stdioConfig
    )

    await expect(plugin.functions({} as any, { userId: 'user-1' })).resolves.toEqual({})
  })
})
