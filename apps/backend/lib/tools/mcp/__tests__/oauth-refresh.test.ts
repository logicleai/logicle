import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMcpOAuthToken } from '@/backend/lib/tools/mcp/oauth'

const state = vi.hoisted(() => ({
  stored: undefined as string | undefined,
  upserted: undefined as string | undefined,
  deleted: false,
}))

vi.mock('@/models/userSecrets', () => ({
  getUserSecretValue: async () =>
    state.stored === undefined ? { status: 'missing' } : { status: 'ok', value: state.stored },
  upsertUserSecret: async (_u: string, _c: string, _t: string, _l: string, value: string) => {
    state.upserted = value
  },
  deleteUserSecretByContext: async () => {
    state.deleted = true
  },
}))

const expired = () => new Date(Date.now() - 3600_000).toISOString()

const mockFetch = (tokenResponse: () => Response | Promise<Response>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('oauth-protected-resource')) {
        return new Response(
          JSON.stringify({
            resource: 'https://mcp.example.com/mcp',
            authorization_servers: ['https://auth.example.com'],
          })
        )
      }
      if (url.includes('well-known')) {
        return new Response(
          JSON.stringify({
            authorization_endpoint: 'https://auth.example.com/authorize',
            token_endpoint: 'https://auth.example.com/token',
          })
        )
      }
      return tokenResponse()
    })
  )
}

const resolve = () =>
  resolveMcpOAuthToken(
    'user',
    'tool',
    'Tool',
    { type: 'oauth', clientId: 'client' } as never,
    'https://mcp.example.com/mcp'
  )

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('resolveMcpOAuthToken refresh', () => {
  beforeEach(() => {
    state.upserted = undefined
    state.deleted = false
    state.stored = JSON.stringify({
      access_token: 'old',
      refresh_token: 'refresh-1',
      scope: 'api://x/Read offline_access',
      expires_at: expired(),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('refreshes an expired token and keeps the refresh token when the server omits it', async () => {
    mockFetch(() => json(200, { access_token: 'new', expires_in: 3600 }))
    expect(await resolve()).toEqual({ status: 'ok', accessToken: 'new' })
    expect(JSON.parse(state.upserted!)).toMatchObject({
      access_token: 'new',
      refresh_token: 'refresh-1',
    })
  })

  it('stores the rotated refresh token when the server returns one', async () => {
    mockFetch(() =>
      json(200, { access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 })
    )
    await resolve()
    expect(JSON.parse(state.upserted!).refresh_token).toBe('refresh-2')
  })

  it('drops the secret when the grant is rejected', async () => {
    mockFetch(() => json(400, { error: 'invalid_grant', error_description: 'revoked' }))
    expect(await resolve()).toEqual({ status: 'missing' })
    expect(state.deleted).toBe(true)
  })

  it('keeps the secret on a server error', async () => {
    mockFetch(() => json(503, { error: 'temporarily_unavailable' }))
    expect(await resolve()).toEqual({ status: 'unavailable' })
    expect(state.deleted).toBe(false)
  })

  it('keeps the secret on a network error', async () => {
    mockFetch(() => {
      throw new Error('ECONNRESET')
    })
    expect(await resolve()).toEqual({ status: 'unavailable' })
    expect(state.deleted).toBe(false)
  })
})
