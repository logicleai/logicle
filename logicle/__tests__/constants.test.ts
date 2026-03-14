import { describe, expect, test } from 'vitest'

describe('lib/const', () => {
  test('DEFAULT_SYSTEM_PROMPT is a non-empty string', async () => {
    const { DEFAULT_SYSTEM_PROMPT } = await import('@/lib/const')
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe('string')
    expect(DEFAULT_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  test('DEFAULT_TEMPERATURE is a number', async () => {
    const { DEFAULT_TEMPERATURE } = await import('@/lib/const')
    expect(typeof DEFAULT_TEMPERATURE).toBe('number')
    expect(isNaN(DEFAULT_TEMPERATURE)).toBe(false)
  })
})

describe('lib/version', () => {
  test('appVersion is a non-empty string', async () => {
    const { appVersion } = await import('@/lib/version')
    expect(typeof appVersion).toBe('string')
    expect(appVersion.length).toBeGreaterThan(0)
  })
})

describe('lib/userSecrets/constants', () => {
  test('USER_PROVIDED_API_KEY is a string constant', async () => {
    const { USER_PROVIDED_API_KEY } = await import('@/lib/userSecrets/constants')
    expect(USER_PROVIDED_API_KEY).toBe('user_provided')
  })

  test('USER_SECRET_TYPE and MCP_OAUTH_SECRET_TYPE are string literals', async () => {
    const { USER_SECRET_TYPE, MCP_OAUTH_SECRET_TYPE } = await import('@/lib/userSecrets/constants')
    expect(USER_SECRET_TYPE).toBe('backend-credentials')
    expect(MCP_OAUTH_SECRET_TYPE).toBe('mcp-oauth')
  })

  test('isUserProvidedApiKey returns true for user_provided', async () => {
    const { isUserProvidedApiKey } = await import('@/lib/userSecrets/constants')
    expect(isUserProvidedApiKey('user_provided')).toBe(true)
  })

  test('isUserProvidedApiKey returns false for other strings', async () => {
    const { isUserProvidedApiKey } = await import('@/lib/userSecrets/constants')
    expect(isUserProvidedApiKey('sk-other-key')).toBe(false)
    expect(isUserProvidedApiKey(undefined)).toBe(false)
    expect(isUserProvidedApiKey(null)).toBe(false)
  })
})
