import { test, expect } from 'vitest'
import { extractSecretsFromConfig } from '@/lib/tools/configSecrets'
import { mcpPluginSchema } from '@/lib/tools/mcp/interface'

const buildMcpConfig = (overrides: Record<string, unknown> = {}) => ({
  url: 'https://example.com',
  authentication: {
    type: 'oauth',
    clientId: 'client-id',
    clientSecret: 'super-secret',
    preferTopLevelNavigation: false,
    activationMode: 'preflight',
    ...overrides,
  },
})

test('extractSecretsFromConfig captures MCP OAuth clientSecret', () => {
  const config = buildMcpConfig()
  const { sanitizedConfig, secrets } = extractSecretsFromConfig(mcpPluginSchema, config)
  expect(secrets).toEqual([{ key: 'clientSecret', value: 'super-secret' }])
  expect(sanitizedConfig).toMatchObject({
    authentication: {
      type: 'oauth',
      clientSecret: String.raw`\${secret.clientSecret}`,
    },
  })
})

test('extractSecretsFromConfig ignores non-oauth configs', () => {
  const config = {
    url: 'https://example.com',
    authentication: {
      type: 'none',
    },
  }
  const { sanitizedConfig, secrets } = extractSecretsFromConfig(mcpPluginSchema, config)
  expect(secrets).toEqual([])
  expect(sanitizedConfig).toEqual(config)
})
