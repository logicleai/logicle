import crypto from 'node:crypto'
import env from '@/lib/env'
import { getUserSecretValue, upsertUserSecret } from '@/models/userSecrets'
import { MCP_OAUTH_SECRET_TYPE } from '@/lib/userSecrets/constants'
import type { McpPluginAuthentication } from './interface'

export type McpOAuthTokenSet = {
  access_token: string
  token_type?: string
  refresh_token?: string
  scope?: string
  expires_in?: number
  expires_at?: string
}

type ProtectedResourceMetadata = {
  resource?: string
  authorization_servers?: string[]
  scopes_supported?: string[]
}

type AuthorizationServerMetadata = {
  authorization_endpoint?: string
  token_endpoint?: string
}

type OAuthClientConfig = {
  clientId: string
  clientSecret?: string
}

type OAuthStatePayload = {
  userId: string
  toolId: string
  issuedAt: string
  nonce: string
}

const base64UrlEncode = (input: string) =>
  Buffer.from(input).toString('base64url').replace(/=+$/g, '')

const base64UrlDecode = (input: string) => Buffer.from(input, 'base64url').toString('utf-8')

const signState = (payload: OAuthStatePayload) => {
  const json = JSON.stringify(payload)
  const encoded = base64UrlEncode(json)
  const signature = crypto
    .createHmac('sha256', env.nextAuth.secret)
    .update(encoded)
    .digest('base64url')
  return `${encoded}.${signature}`
}

export const createMcpOAuthState = (userId: string, toolId: string) => {
  const payload: OAuthStatePayload = {
    userId,
    toolId,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(16).toString('hex'),
  }
  return signState(payload)
}

export const verifyMcpOAuthState = (state: string): OAuthStatePayload | null => {
  const [encoded, signature] = state.split('.')
  if (!encoded || !signature) return null
  const expected = crypto
    .createHmac('sha256', env.nextAuth.secret)
    .update(encoded)
    .digest('base64url')
  if (expected !== signature) return null
  try {
    return JSON.parse(base64UrlDecode(encoded)) as OAuthStatePayload
  } catch {
    return null
  }
}

const normalizeTokenSet = (raw: Record<string, unknown>): McpOAuthTokenSet => {
  const expiresIn =
    typeof raw.expires_in === 'number' ? raw.expires_in : Number(raw.expires_in ?? undefined)
  const expiresAt =
    typeof raw.expires_at === 'string'
      ? raw.expires_at
      : Number.isFinite(expiresIn)
      ? new Date(Date.now() + (expiresIn as number) * 1000).toISOString()
      : undefined
  return {
    access_token: String(raw.access_token ?? ''),
    token_type: raw.token_type ? String(raw.token_type) : undefined,
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : undefined,
    scope: raw.scope ? String(raw.scope) : undefined,
    expires_in: Number.isFinite(expiresIn) ? (expiresIn as number) : undefined,
    expires_at: expiresAt,
  }
}

const isTokenExpired = (token: McpOAuthTokenSet) => {
  if (!token.expires_at) return false
  const expiresAt = Date.parse(token.expires_at)
  if (Number.isNaN(expiresAt)) return false
  return Date.now() + 60_000 >= expiresAt
}

const resolveOAuthClient = (
  auth: Extract<McpPluginAuthentication, { type: 'oauth' }>,
  serverUrl?: string
): OAuthClientConfig => {
  if (auth.clientId) {
    return { clientId: auth.clientId, clientSecret: auth.clientSecret }
  }
  if (serverUrl) {
    const host = new URL(serverUrl).hostname
    if (host.endsWith('githubcopilot.com') || host.endsWith('github.com')) {
      const clientId = process.env.MCP_OAUTH_GITHUB_CLIENT_ID
      if (clientId) {
        return { clientId, clientSecret: process.env.MCP_OAUTH_GITHUB_CLIENT_SECRET }
      }
    }
  }
  const defaultClientId = process.env.MCP_OAUTH_DEFAULT_CLIENT_ID
  if (defaultClientId) {
    return { clientId: defaultClientId, clientSecret: process.env.MCP_OAUTH_DEFAULT_CLIENT_SECRET }
  }
  throw new Error(
    'Missing OAuth clientId. Configure it in the MCP tool or set MCP_OAUTH_DEFAULT_CLIENT_ID.'
  )
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`Failed fetching ${url} (${response.status})`)
  }
  return (await response.json()) as T
}

const buildWellKnownUrl = (issuer: string, suffix: string) => {
  const url = new URL(issuer)
  const path = url.pathname.replace(/\/$/, '')
  url.pathname = path ? `/.well-known/${suffix}${path}` : `/.well-known/${suffix}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

const discoverAuthorizationServerMetadata = async (
  issuer: string
): Promise<AuthorizationServerMetadata | null> => {
  const oauthUrl = buildWellKnownUrl(issuer, 'oauth-authorization-server')
  try {
    return await fetchJson<AuthorizationServerMetadata>(oauthUrl)
  } catch {
    // try OIDC discovery
  }
  const oidcUrl = buildWellKnownUrl(issuer, 'openid-configuration')
  try {
    return await fetchJson<AuthorizationServerMetadata>(oidcUrl)
  } catch {
    return null
  }
}

const deriveResourceMetadataUrl = (serverUrl: string) => {
  const url = new URL(serverUrl)
  const path = url.pathname.replace(/\/$/, '')
  url.pathname = path
    ? `/.well-known/oauth-protected-resource${path}`
    : '/.well-known/oauth-protected-resource'
  url.search = ''
  url.hash = ''
  return url.toString()
}

const resolveProtectedResourceMetadata = async (
  serverUrl?: string
): Promise<ProtectedResourceMetadata | null> => {
  const resourceUrl = serverUrl ? deriveResourceMetadataUrl(serverUrl) : undefined
  if (!resourceUrl) return null
  return await fetchJson<ProtectedResourceMetadata>(resourceUrl)
}

const resolveAuthorizationServer = async (
  serverUrl?: string
): Promise<{
  authorizationUrl: string
  tokenUrl: string
  resource?: string
  scopes?: string[]
}> => {
  const resourceMetadata = await resolveProtectedResourceMetadata(serverUrl)
  const authorizationServers = resourceMetadata?.authorization_servers ?? []
  for (const issuer of authorizationServers) {
    const serverMetadata = await discoverAuthorizationServerMetadata(issuer)
    if (serverMetadata?.authorization_endpoint && serverMetadata?.token_endpoint) {
      return {
        authorizationUrl: serverMetadata.authorization_endpoint,
        tokenUrl: serverMetadata.token_endpoint,
        resource: resourceMetadata?.resource,
        scopes: resourceMetadata?.scopes_supported,
      }
    }
  }
  throw new Error('Unable to resolve OAuth authorization/token endpoints')
}

const tokenRequest = async (
  params: Record<string, string>,
  tokenUrl: string,
  resource?: string,
  client?: OAuthClientConfig
): Promise<McpOAuthTokenSet> => {
  const body = new URLSearchParams(params)
  if (!client?.clientId) {
    throw new Error('Missing OAuth clientId')
  }
  if (client.clientSecret) {
    body.set('client_secret', client.clientSecret)
  }
  body.set('client_id', client.clientId)
  if (resource) {
    body.set('resource', resource)
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body,
  })
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message =
      typeof json.error_description === 'string'
        ? json.error_description
        : typeof json.error === 'string'
        ? json.error
        : `OAuth token request failed (${response.status})`
    throw new Error(message)
  }
  const normalized = normalizeTokenSet(json)
  if (!normalized.access_token) {
    throw new Error('OAuth token response missing access_token')
  }
  return normalized
}

export const exchangeMcpOAuthCode = async (
  auth: Extract<McpPluginAuthentication, { type: 'oauth' }>,
  code: string,
  redirectUri: string,
  serverUrl?: string
) => {
  const resolved = await resolveAuthorizationServer(serverUrl)
  const client = resolveOAuthClient(auth, serverUrl)
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    },
    resolved.tokenUrl,
    resolved.resource,
    client
  )
}

export const refreshMcpOAuthToken = async (
  auth: Extract<McpPluginAuthentication, { type: 'oauth' }>,
  refreshToken: string,
  serverUrl?: string
) => {
  const resolved = await resolveAuthorizationServer(serverUrl)
  const client = resolveOAuthClient(auth, serverUrl)
  return tokenRequest(
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    resolved.tokenUrl,
    resolved.resource,
    client
  )
}

export const resolveMcpOAuthToken = async (
  userId: string,
  toolId: string,
  toolName: string,
  auth: Extract<McpPluginAuthentication, { type: 'oauth' }>,
  serverUrl?: string
): Promise<
  { status: 'ok'; accessToken: string } | { status: 'missing' } | { status: 'unreadable' }
> => {
  const resolution = await getUserSecretValue(userId, toolId, MCP_OAUTH_SECRET_TYPE)
  if (resolution.status !== 'ok') {
    return resolution.status === 'unreadable' ? { status: 'unreadable' } : { status: 'missing' }
  }
  let tokenSet: McpOAuthTokenSet | null = null
  try {
    tokenSet = JSON.parse(resolution.value) as McpOAuthTokenSet
  } catch {
    return { status: 'unreadable' }
  }
  if (!tokenSet?.access_token) {
    return { status: 'missing' }
  }
  if (isTokenExpired(tokenSet)) {
    if (!tokenSet.refresh_token) {
      return { status: 'missing' }
    }
    try {
      const refreshed = await refreshMcpOAuthToken(auth, tokenSet.refresh_token, serverUrl)
      await upsertUserSecret(
        userId,
        toolId,
        MCP_OAUTH_SECRET_TYPE,
        `MCP OAuth (${toolName})`,
        JSON.stringify(refreshed)
      )
      return { status: 'ok', accessToken: refreshed.access_token }
    } catch {
      return { status: 'missing' }
    }
  }
  return { status: 'ok', accessToken: tokenSet.access_token }
}

export const buildMcpOAuthAuthorizeUrl = (
  userId: string,
  toolId: string,
  auth: Extract<McpPluginAuthentication, { type: 'oauth' }>,
  serverUrl?: string
) => {
  const redirectUri = `${env.appUrl}/api/mcp/oauth/callback`
  const state = createMcpOAuthState(userId, toolId)
  return resolveAuthorizationServer(serverUrl).then((resolved) => {
    const client = resolveOAuthClient(auth, serverUrl)
    const url = new URL(resolved.authorizationUrl)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', client.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    if (resolved.scopes && resolved.scopes.length > 0) {
      url.searchParams.set('scope', resolved.scopes.join(' '))
    }
    if (resolved.resource) {
      url.searchParams.set('resource', resolved.resource)
    }
    return {
      url: url.toString(),
      redirectUri,
    }
  })
}
