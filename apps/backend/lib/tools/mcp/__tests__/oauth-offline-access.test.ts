import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMcpOAuthAuthorizeUrl, isMcpOAuthTokenUsable } from '@/backend/lib/tools/mcp/oauth'

const mockDiscovery = (authServerScopes: string[] | undefined) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const body = url.includes('oauth-protected-resource')
        ? {
            resource: 'https://mcp.example.com/mcp',
            authorization_servers: ['https://auth.example.com'],
            scopes_supported: ['api://x/Read'],
          }
        : {
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
            scopes_supported: authServerScopes,
          }
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

const authenticate = () =>
  buildMcpOAuthAuthorizeUrl(
    'state',
    { type: 'oauth', clientId: 'client' } as never,
    'tool',
    undefined,
    'https://mcp.example.com/mcp'
  )

describe('MCP OAuth scopes', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requests offline_access when the authorization server supports it', async () => {
    mockDiscovery(['openid', 'offline_access'])
    const { url } = await authenticate()
    expect(new URL(url).searchParams.get('scope')).toBe('api://x/Read offline_access')
  })

  it('does not request offline_access when the authorization server does not list it', async () => {
    mockDiscovery(['openid'])
    const { url } = await authenticate()
    expect(new URL(url).searchParams.get('scope')).toBe('api://x/Read')
  })
})

describe('isMcpOAuthTokenUsable', () => {
  const past = new Date(Date.now() - 3600_000).toISOString()
  const future = new Date(Date.now() + 3600_000).toISOString()

  it('accepts a valid access token', () => {
    expect(isMcpOAuthTokenUsable({ access_token: 'a', expires_at: future })).toBe(true)
  })
  it('accepts an expired token that can be refreshed', () => {
    expect(isMcpOAuthTokenUsable({ access_token: 'a', expires_at: past, refresh_token: 'r' })).toBe(
      true
    )
  })
  it('rejects an expired token without refresh token', () => {
    expect(isMcpOAuthTokenUsable({ access_token: 'a', expires_at: past })).toBe(false)
  })
})
