import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const originalAppUrl = process.env.APP_URL
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET

beforeEach(() => {
  vi.resetModules()
  process.env.APP_URL = 'https://app.example.com'
  process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-1234567890-long'
})

afterEach(() => {
  process.env.APP_URL = originalAppUrl
  process.env.NEXTAUTH_SECRET = originalNextAuthSecret
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('apps/backend/lib/storage/FsStorage', () => {
  test('writes, reads, streams, and removes files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logicle-fs-storage-'))
    const { FsStorage } = await import('@/backend/lib/storage/FsStorage')
    const { collectStreamToBuffer, bufferToReadableStream } = await import(
      '@/backend/lib/storage/utils'
    )

    const storage = new FsStorage(tempDir)
    const filePath = 'nested/test.txt'
    await fs.mkdir(path.join(tempDir, 'nested'), { recursive: true })

    await storage.writeStream(filePath, bufferToReadableStream(Buffer.from('hello world')), null)
    await expect(storage.readBuffer(filePath, null)).resolves.toEqual(Buffer.from('hello world'))
    await expect(collectStreamToBuffer(await storage.readStream(filePath, null))).resolves.toEqual(
      Buffer.from('hello world')
    )

    await storage.rm(filePath)
    await expect(fs.stat(path.join(tempDir, filePath))).rejects.toThrow()

    await fs.rm(tempDir, { recursive: true, force: true })
  })

  test('removes a partially written file when streaming fails', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logicle-fs-storage-fail-'))
    const { FsStorage } = await import('@/backend/lib/storage/FsStorage')

    const storage = new FsStorage(tempDir)
    const filePath = 'broken.bin'
    const failingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.error(new Error('stream exploded'))
      },
    })

    await expect(storage.writeStream(filePath, failingStream, null)).rejects.toThrow(
      'stream exploded'
    )
    await expect(fs.stat(path.join(tempDir, filePath))).rejects.toThrow()

    await fs.rm(tempDir, { recursive: true, force: true })
  })
})

describe('apps/backend/lib/auth/mcpOauth', () => {
  test('session options use secure none cookies on https app urls', async () => {
    const { sessionOptions } = await import('@/backend/lib/auth/mcpOauth')

    expect(sessionOptions).toMatchObject({
      cookieName: 'mcp_oauth_session',
      ttl: 15 * 60,
      cookieOptions: {
        secure: true,
        sameSite: 'none',
      },
    })
  })

  test('getMcpOAuthSession delegates to iron-session with repo session options', async () => {
    const fakeSession = { save: vi.fn() }
    const getIronSession = vi.fn().mockResolvedValue(fakeSession)

    vi.doMock('iron-session', () => ({
      getIronSession,
    }))

    const { getMcpOAuthSession, sessionOptions } = await import('@/backend/lib/auth/mcpOauth')
    const cookies = { get: vi.fn(), set: vi.fn() }

    await expect(getMcpOAuthSession(cookies as any)).resolves.toBe(fakeSession)
    expect(getIronSession).toHaveBeenCalledWith(cookies, sessionOptions)
  })
})

describe('apps/backend/lib/tools/mcp/oauth', () => {
  test('getMcpToolAvailability handles invalid, non-oauth, and oauth configs', async () => {
    const { getMcpToolAvailability } = await import('@/lib/tools/schemas')

    expect(getMcpToolAvailability('{not-json', false)).toBe('require-auth')
    expect(getMcpToolAvailability({ url: 'https://example.com' }, false)).toBe('ok')
    expect(
      getMcpToolAvailability(
        JSON.stringify({
          url: 'https://example.com',
          authentication: { type: 'oauth', clientId: 'client-id' },
        }),
        false
      )
    ).toBe('require-auth')
    expect(
      getMcpToolAvailability(
        {
          url: 'https://example.com',
          authentication: { type: 'oauth', clientId: 'client-id' },
        },
        true
      )
    ).toBe('ok')
  })

  test('buildMcpOAuthAuthorizeUrl builds authorize url with PKCE, scope, and resource', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('oauth-protected-resource')) {
        return new Response(
          JSON.stringify({
            resource: 'https://resource.example.com',
            authorization_servers: ['https://issuer.example.com'],
            scopes_supported: ['read', 'write'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('oauth-authorization-server')) {
        return new Response(
          JSON.stringify({
            authorization_endpoint: 'https://issuer.example.com/authorize',
            token_endpoint: 'https://issuer.example.com/token',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      throw new Error(`Unexpected URL ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock as any)

    const { buildMcpOAuthAuthorizeUrl } = await import('@/backend/lib/tools/mcp/oauth')

    const result = await buildMcpOAuthAuthorizeUrl(
      'state-123',
      {
        type: 'oauth',
        clientId: 'client-123',
        preferTopLevelNavigation: false,
        activationMode: 'preflight',
      },
      'tool-1',
      'challenge-abc',
      'https://server.example.com/mcp'
    )

    const url = new URL(result.url)
    expect(result.redirectUri).toBe('https://app.example.com/api/mcp/oauth/callback')
    expect(url.origin + url.pathname).toBe('https://issuer.example.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe(result.redirectUri)
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-abc')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('read write')
    expect(url.searchParams.get('resource')).toBe('https://resource.example.com')
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://server.example.com/.well-known/oauth-protected-resource/mcp',
      'https://issuer.example.com/.well-known/oauth-authorization-server',
    ])
  })

  test.each([
    {
      issuer: 'https://login.microsoftonline.com/organizations/v2.0',
      oauthUrl:
        'https://login.microsoftonline.com/.well-known/oauth-authorization-server/organizations/v2.0',
      oidcUrl:
        'https://login.microsoftonline.com/organizations/v2.0/.well-known/openid-configuration',
    },
    {
      issuer: 'https://login.microsoftonline.com/organizations/v2.0/',
      oauthUrl:
        'https://login.microsoftonline.com/.well-known/oauth-authorization-server/organizations/v2.0',
      oidcUrl:
        'https://login.microsoftonline.com/organizations/v2.0/.well-known/openid-configuration',
    },
    {
      issuer: 'https://issuer.example.com',
      oauthUrl: 'https://issuer.example.com/.well-known/oauth-authorization-server',
      oidcUrl: 'https://issuer.example.com/.well-known/openid-configuration',
    },
  ])('falls back to OIDC discovery for $issuer', async ({ issuer, oauthUrl, oidcUrl }) => {
    const authorizationEndpoint =
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize'
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://server.example.com/.well-known/oauth-protected-resource/mcp') {
        return Response.json({
          resource: 'https://server.example.com/mcp',
          authorization_servers: [issuer],
          scopes_supported: ['read'],
        })
      }
      if (url === oidcUrl) {
        return Response.json({
          authorization_endpoint: authorizationEndpoint,
          token_endpoint: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
        })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { buildMcpOAuthAuthorizeUrl } = await import('@/backend/lib/tools/mcp/oauth')
    const result = await buildMcpOAuthAuthorizeUrl(
      'state-123',
      {
        type: 'oauth',
        clientId: 'client-123',
        preferTopLevelNavigation: false,
        activationMode: 'preflight',
      },
      'tool-1',
      'challenge-abc',
      'https://server.example.com/mcp'
    )

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://server.example.com/.well-known/oauth-protected-resource/mcp',
      oauthUrl,
      oidcUrl,
    ])
    const url = new URL(result.url)
    expect(url.origin + url.pathname).toBe(authorizationEndpoint)
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-abc')
    expect(url.searchParams.get('scope')).toBe('read')
    expect(url.searchParams.get('resource')).toBe('https://server.example.com/mcp')
    expect(url.searchParams.get('redirect_uri')).toBe(result.redirectUri)
  })

  test('resolveMcpOAuthToken refreshes expired tokens and persists the refreshed value', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('oauth-protected-resource')) {
        return new Response(
          JSON.stringify({
            authorization_servers: ['https://issuer.example.com'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url.includes('oauth-authorization-server')) {
        return new Response(
          JSON.stringify({
            authorization_endpoint: 'https://issuer.example.com/authorize',
            token_endpoint: 'https://issuer.example.com/token',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      if (url === 'https://issuer.example.com/token') {
        expect(init?.method).toBe('POST')
        const body = init?.body as URLSearchParams
        expect(body.get('grant_type')).toBe('refresh_token')
        expect(body.get('refresh_token')).toBe('refresh-me')
        expect(body.get('client_id')).toBe('client-123')
        return new Response(
          JSON.stringify({
            access_token: 'fresh-token',
            refresh_token: 'refresh-me',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }
      throw new Error(`Unexpected URL ${url}`)
    })

    const getUserSecretValue = vi.fn().mockResolvedValue({
      status: 'ok',
      value: JSON.stringify({
        access_token: 'expired-token',
        refresh_token: 'refresh-me',
        expires_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      }),
    })
    const upsertUserSecret = vi.fn().mockResolvedValue(undefined)

    vi.doMock('@/models/userSecrets', () => ({
      getUserSecretValue,
      upsertUserSecret,
    }))
    vi.stubGlobal('fetch', fetchMock as any)

    const { resolveMcpOAuthToken } = await import('@/backend/lib/tools/mcp/oauth')

    await expect(
      resolveMcpOAuthToken(
        'user-1',
        'tool-1',
        'Test MCP',
        {
          type: 'oauth',
          clientId: 'client-123',
          preferTopLevelNavigation: false,
          activationMode: 'preflight',
        },
        'https://server.example.com/mcp'
      )
    ).resolves.toEqual({
      status: 'ok',
      accessToken: 'fresh-token',
    })

    expect(upsertUserSecret).toHaveBeenCalledWith(
      'user-1',
      'tool-1',
      'mcp-oauth',
      'MCP OAuth (Test MCP)',
      expect.stringContaining('"access_token":"fresh-token"')
    )
  })
})
