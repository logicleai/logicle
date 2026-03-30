import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { createUser, getUserByEmail } from '@/models/user'
import {
  createSession,
  findStoredSession,
  getUserSessionById,
  listUserSessions,
} from '@/models/session'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createMutableCookieStore, parseCookieHeader } from '@/lib/http/cookies'
import { getSsoFlowSession } from '@/lib/auth/oidc'
import * as loginRoute from '@/api/auth/login/route'
import * as logoutRoute from '@/api/auth/logout/route'
import * as refreshRoute from '@/api/auth/refresh/route'
import * as sessionsRoute from '@/api/auth/sessions/route'
import * as sessionRoute from '@/api/auth/sessions/[sessionId]/route'
import * as samlLoginRoute from '@/api/auth/saml/login/route'
import * as oidcCallbackRoute from '@/api/oauth/oidc/route'
import * as samlCallbackRoute from '@/api/oauth/saml/route'

const mocks = vi.hoisted(() => ({
  discovery: vi.fn(async () => ({ issuer: 'https://issuer.example.com' })),
  randomPKCECodeVerifier: vi.fn(() => 'pkce-verifier'),
  calculatePKCECodeChallenge: vi.fn(async () => 'pkce-challenge'),
  randomState: vi.fn(() => 'oidc-state'),
  buildAuthorizationUrl: vi.fn(
    (_config: unknown, params: Record<string, string>) =>
      new URL(
        `https://oidc.example.com/authorize?state=${params.state}&code_challenge=${params.code_challenge}`
      )
  ),
  authorizationCodeGrant: vi.fn(),
  samlConstructor: vi.fn(),
  samlGetAuthorizeUrlAsync: vi.fn(),
  samlValidatePostResponseAsync: vi.fn(),
  getOrCreateUserByEmail: vi.fn(),
  setRootSpanUser: vi.fn(),
}))

vi.mock('openid-client', () => ({
  discovery: mocks.discovery,
  randomPKCECodeVerifier: mocks.randomPKCECodeVerifier,
  calculatePKCECodeChallenge: mocks.calculatePKCECodeChallenge,
  randomState: mocks.randomState,
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  authorizationCodeGrant: mocks.authorizationCodeGrant,
}))

vi.mock('@node-saml/node-saml', async (importActual) => {
  const actual = await importActual<typeof import('@node-saml/node-saml')>()
  return {
    ...actual,
    SAML: vi.fn().mockImplementation((config: unknown) => {
      mocks.samlConstructor(config)
      return {
        getAuthorizeUrlAsync: mocks.samlGetAuthorizeUrlAsync,
        validatePostResponseAsync: mocks.samlValidatePostResponseAsync,
      }
    }),
  }
})

vi.mock('@/models/user', async (importActual) => {
  const actual = await importActual<typeof import('@/models/user')>()
  return {
    ...actual,
    getOrCreateUserByEmail: mocks.getOrCreateUserByEmail,
  }
})

vi.mock('@/lib/tracing/root-registry', () => ({
  setRootSpanUser: mocks.setRootSpanUser,
}))

function getDialectName(client: Kysely<any>) {
  if (client.getExecutor().adapter instanceof SqliteAdapter) return 'sqlite'
  if (client.getExecutor().adapter instanceof PostgresAdapter) return 'postgresql'
  return undefined
}

async function migrateTestDb() {
  const dialectName = getDialectName(db)
  const migrator = new Migrator({
    db,
    provider: {
      getMigrations: async () =>
        Object.fromEntries(
          Object.entries(migrationModules).map(([name, migration]) => [
            name,
            {
              up: async (client: Kysely<any>) => {
                await (migration as { up: (db: Kysely<any>, dialect?: string) => Promise<void> }).up(
                  client,
                  dialectName
                )
              },
            } satisfies Migration,
          ])
        ),
    },
  })

  const { error } = await migrator.migrateToLatest()
  if (error) {
    throw error
  }
}

async function resetAuthTables() {
  await db.deleteFrom('Session').execute()
  await db.deleteFrom('IdpConnection').execute()
  await db.deleteFrom('Property').execute()
  await db.deleteFrom('User').execute()
}

function sameOriginHeaders(headers?: HeadersInit) {
  return new Headers({
    'sec-fetch-site': 'same-origin',
    ...headers,
  })
}

function firstCookiePair(setCookie: string) {
  return setCookie.split(';', 1)[0]
}

function mergeResponseCookies(currentCookieHeader: string | undefined, response: Response) {
  const cookies = parseCookieHeader(currentCookieHeader ?? null)
  const setCookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie')!]
        : []

  for (const setCookie of setCookies) {
    const cookiePair = firstCookiePair(setCookie)
    const separator = cookiePair.indexOf('=')
    const name = cookiePair.slice(0, separator)
    const value = decodeURIComponent(cookiePair.slice(separator + 1))
    cookies.set(name, value)
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ')
}

async function createPasswordUser(email: string, password = 'correct-horse-battery-staple') {
  return await createUser({
    name: 'Ada',
    email,
    password,
    ssoUser: 0,
  })
}

async function insertIdpConnection(params: {
  id: string
  type: 'OIDC' | 'SAML'
  config: Record<string, unknown>
}) {
  await db
    .insertInto('IdpConnection')
    .values({
      id: params.id,
      type: params.type,
      name: `${params.type} connection`,
      description: `${params.type} description`,
      config: JSON.stringify(params.config),
    })
    .execute()
}

function cookieHeaderFromStore(cookieStore: ReturnType<typeof createMutableCookieStore>) {
  const cookieHeader = cookieStore.modifications
    .map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
    .join('; ')
  return cookieHeader
}

async function buildSsoCookie(sessionData: {
  idp: string
  state?: string
  code_verifier?: string
}) {
  const cookieStore = createMutableCookieStore(new Headers())
  const session = await getSsoFlowSession(cookieStore)
  session.idp = sessionData.idp
  session.state = sessionData.state
  session.code_verifier = sessionData.code_verifier
  await session.save()
  return cookieHeaderFromStore(cookieStore)
}

beforeAll(async () => {
  await migrateTestDb()
  const actualUserModels = await vi.importActual<typeof import('@/models/user')>('@/models/user')
  mocks.getOrCreateUserByEmail.mockImplementation(actualUserModels.getOrCreateUserByEmail)
})

beforeEach(async () => {
  await resetAuthTables()

  mocks.discovery.mockClear()
  mocks.randomPKCECodeVerifier.mockClear()
  mocks.calculatePKCECodeChallenge.mockClear()
  mocks.randomState.mockClear()
  mocks.buildAuthorizationUrl.mockClear()
  mocks.authorizationCodeGrant.mockReset()
  mocks.samlConstructor.mockReset()
  mocks.samlGetAuthorizeUrlAsync.mockReset()
  mocks.samlValidatePostResponseAsync.mockReset()
  mocks.setRootSpanUser.mockClear()

  const actualUserModels = await vi.importActual<typeof import('@/models/user')>('@/models/user')
  mocks.getOrCreateUserByEmail.mockReset()
  mocks.getOrCreateUserByEmail.mockImplementation(actualUserModels.getOrCreateUserByEmail)

  mocks.samlGetAuthorizeUrlAsync.mockResolvedValue('https://saml.example.com/login')
})

describe('password auth routes', () => {
  test('login rejects unknown credentials', async () => {
    const response = await loginRoute.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: sameOriginHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ email: 'missing@example.com', password: 'secret' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'invalid-credentials', values: {} },
    })
  })

  test('login rejects users without a password', async () => {
    await createUser({
      name: 'SSO only',
      email: 'sso@example.com',
      ssoUser: 1,
    })

    const response = await loginRoute.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: sameOriginHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ email: 'sso@example.com', password: 'secret' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'authentication method not supported for this user', values: {} },
    })
  })

  test('login rejects invalid passwords', async () => {
    await createPasswordUser('ada@example.com')

    const response = await loginRoute.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: sameOriginHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ email: 'ada@example.com', password: 'wrong-password' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'invalid-credentials', values: {} },
    })
  })

  test('login creates a session cookie and stores request metadata', async () => {
    const user = await createPasswordUser('ada@example.com')

    const response = await loginRoute.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: sameOriginHeaders({
          'content-type': 'application/json',
          'user-agent': 'Vitest Browser',
          'x-forwarded-for': '203.0.113.10, 198.51.100.2',
        }),
        body: JSON.stringify({ email: 'ADA@example.com', password: 'correct-horse-battery-staple' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(204)
    const setCookie = response.headers.getSetCookie()[0]
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`)

    const sessionId = parseCookieHeader(firstCookiePair(setCookie)).get(SESSION_COOKIE_NAME)
    expect(sessionId).toBeTruthy()

    const storedSession = await findStoredSession(sessionId!)
    expect(storedSession).toMatchObject({
      sessionId,
      userId: user.id,
      authMethod: 'password',
      idpConnectionId: null,
    })

    const rawSession = await getUserSessionById(user.id, sessionId!)
    expect(rawSession).toMatchObject({
      userAgent: 'Vitest Browser',
      ipAddress: '203.0.113.10',
    })
  })

  test('logout clears the cookie and deletes the backing session', async () => {
    const user = await createPasswordUser('logout@example.com')
    const expiresAt = new Date(Date.now() + 60_000)
    const session = await createSession(user.id, expiresAt, 'password', null)

    const response = await logoutRoute.POST(
      new Request('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: sameOriginHeaders({ cookie: `${SESSION_COOKIE_NAME}=${session.id}` }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(204)
    expect(response.headers.getSetCookie()[0]).toContain(`${SESSION_COOKIE_NAME}=`)
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0')
    expect(await getUserSessionById(user.id, session.id)).toBeUndefined()
  })

  test('refresh extends the current session and reissues the cookie', async () => {
    const user = await createPasswordUser('refresh@example.com')
    const previousExpiry = new Date(Date.now() + 30_000)
    const session = await createSession(user.id, previousExpiry, 'password', null)

    const response = await refreshRoute.POST(
      new Request('http://localhost/api/auth/refresh', {
        method: 'POST',
        headers: sameOriginHeaders({
          cookie: `${SESSION_COOKIE_NAME}=${session.id}`,
          'user-agent': 'Refresh Agent',
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(previousExpiry.getTime())
    expect(response.headers.getSetCookie()[0]).toContain(`${SESSION_COOKIE_NAME}=${session.id}`)

    const refreshedSession = await getUserSessionById(user.id, session.id)
    expect(new Date(refreshedSession!.expiresAt).getTime()).toBeGreaterThan(previousExpiry.getTime())
  })

  test('lists active sessions and marks the current one', async () => {
    const user = await createPasswordUser('sessions@example.com')
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const current = await createSession(
      user.id,
      new Date(Date.now() + 60_000),
      'password',
      null,
      { userAgent: 'Current Browser', ipAddress: '192.0.2.10' }
    )
    const other = await createSession(
      user.id,
      new Date(Date.now() + 60_000),
      'idp',
      'oidc-1',
      { userAgent: 'Other Browser', ipAddress: '198.51.100.8' }
    )

    const response = await sessionsRoute.GET(
      new Request('http://localhost/api/auth/sessions', {
        headers: sameOriginHeaders({
          cookie: `${SESSION_COOKIE_NAME}=${current.id}`,
          'user-agent': 'Current Browser',
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: current.id,
          authMethod: 'password',
          idpConnectionId: null,
          userAgent: 'Current Browser',
          ipAddress: '192.0.2.10',
          isCurrent: true,
        }),
        expect.objectContaining({
          id: other.id,
          authMethod: 'idp',
          idpConnectionId: 'oidc-1',
          userAgent: 'Other Browser',
          ipAddress: '198.51.100.8',
          isCurrent: false,
        }),
      ])
    )

    expect(mocks.setRootSpanUser).toHaveBeenCalledWith(user.id)
  })

  test('lists sessions with null activity metadata when those fields are absent', async () => {
    const user = await createPasswordUser('sessions-null@example.com')
    const current = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)
    await db
      .insertInto('Session')
      .values({
        id: 'secondary-null-session',
        userId: user.id,
        authMethod: 'password',
        idpConnectionId: null,
        lastSeenAt: null,
        userAgent: null,
        ipAddress: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
      .execute()

    const response = await sessionsRoute.GET(
      new Request('http://localhost/api/auth/sessions', {
        headers: sameOriginHeaders({
          cookie: `${SESSION_COOKIE_NAME}=${current.id}`,
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: current.id,
        lastSeenAt: expect.any(String),
        userAgent: null,
        ipAddress: null,
        isCurrent: true,
      }),
      expect.objectContaining({
        id: 'secondary-null-session',
        lastSeenAt: null,
        userAgent: null,
        ipAddress: null,
        isCurrent: false,
      }),
    ])
  })

  test('refuses to delete the current session', async () => {
    const user = await createPasswordUser('current@example.com')
    const current = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)

    const response = await sessionRoute.DELETE(
      new Request(`http://localhost/api/auth/sessions/${current.id}`, {
        method: 'DELETE',
        headers: sameOriginHeaders({ cookie: `${SESSION_COOKIE_NAME}=${current.id}` }),
      }),
      { params: Promise.resolve({ sessionId: current.id }) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Cannot delete the current session', values: {} },
    })
  })

  test('returns not found for a missing secondary session', async () => {
    const user = await createPasswordUser('missing-secondary@example.com')
    const current = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)

    const response = await sessionRoute.DELETE(
      new Request('http://localhost/api/auth/sessions/missing-session', {
        method: 'DELETE',
        headers: sameOriginHeaders({ cookie: `${SESSION_COOKIE_NAME}=${current.id}` }),
      }),
      { params: Promise.resolve({ sessionId: 'missing-session' }) }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'No such session', values: {} },
    })
  })

  test('deletes another active session', async () => {
    const user = await createPasswordUser('delete-secondary@example.com')
    const current = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)
    const other = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)

    const response = await sessionRoute.DELETE(
      new Request(`http://localhost/api/auth/sessions/${other.id}`, {
        method: 'DELETE',
        headers: sameOriginHeaders({ cookie: `${SESSION_COOKIE_NAME}=${current.id}` }),
      }),
      { params: Promise.resolve({ sessionId: other.id }) }
    )

    expect(response.status).toBe(204)
    expect(await getUserSessionById(user.id, other.id)).toBeUndefined()
    const remainingSessions = await listUserSessions(user.id, new Date())
    expect(remainingSessions.map((session) => session.id)).toEqual([current.id])
  })
})

describe('OIDC and SAML auth flows', () => {
  test('rejects SSO login without a connection id', async () => {
    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login', {
        headers: sameOriginHeaders(),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Missing connection', values: {} },
    })
  })

  test('rejects SSO login for unknown connections', async () => {
    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login?connection=missing', {
        headers: sameOriginHeaders(),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Unknown connection', values: {} },
    })
  })

  test('starts the OIDC login flow and stores the transient SSO session', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })

    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login?connection=oidc-1', {
        headers: sameOriginHeaders(),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(
      'https://oidc.example.com/authorize?state=oidc-state&code_challenge=pkce-challenge'
    )

    const ssoCookie = response.headers.getSetCookie()[0]
    expect(ssoCookie).toContain('sso_flow_session=')
    expect(mocks.discovery).toHaveBeenCalledOnce()
  })

  test('starts the SAML login flow and stores the transient SSO session', async () => {
    await insertIdpConnection({
      id: 'saml-1',
      type: 'SAML',
      config: {
        entityID: 'urn:test:idp',
        sso: { postUrl: 'https://idp.example.com/post', redirectUrl: 'https://idp.example.com/redirect' },
        publicKey: 'cert',
      },
    })

    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login?connection=saml-1', {
        headers: sameOriginHeaders({ host: 'localhost:3000' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://saml.example.com/login')
    expect(response.headers.getSetCookie()[0]).toContain('sso_flow_session=')
    expect(mocks.samlGetAuthorizeUrlAsync).toHaveBeenCalledOnce()
  })

  test('returns 500 when SAML initiation cannot produce a redirect', async () => {
    await insertIdpConnection({
      id: 'saml-1',
      type: 'SAML',
      config: {
        entityID: 'urn:test:idp',
        sso: { postUrl: 'https://idp.example.com/post', redirectUrl: 'https://idp.example.com/redirect' },
        publicKey: 'cert',
      },
    })
    mocks.samlGetAuthorizeUrlAsync.mockResolvedValueOnce(null)

    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login?connection=saml-1', {
        headers: sameOriginHeaders({ host: 'localhost:3000' }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'SAML did not return a redirect URL', values: {} },
    })
  })

  test('starts the SAML flow even when the host header is absent', async () => {
    await insertIdpConnection({
      id: 'saml-1',
      type: 'SAML',
      config: {
        entityID: 'urn:test:idp',
        sso: { postUrl: 'https://idp.example.com/post', redirectUrl: 'https://idp.example.com/redirect' },
        publicKey: 'cert',
      },
    })

    const response = await samlLoginRoute.GET(
      new Request('http://localhost/api/auth/saml/login?connection=saml-1', {
        headers: sameOriginHeaders(),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(302)
    expect(mocks.samlGetAuthorizeUrlAsync).toHaveBeenCalledWith(
      expect.stringContaining('"connectionId":"saml-1"'),
      undefined,
      expect.objectContaining({
        additionalParams: expect.objectContaining({
          RelayState: expect.stringContaining('"connectionId":"saml-1"'),
        }),
      })
    )
  })

  test('OIDC callback rejects unknown connections', async () => {
    const cookieHeader = await buildSsoCookie({
      idp: 'missing-oidc',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Unknown OIDC connection', values: {} },
    })
  })

  test('OIDC callback rejects missing state in the transient session', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      code_verifier: 'pkce-verifier',
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Invalid state', values: {} },
    })
  })

  test('OIDC callback rejects claims without email or sub', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({}),
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'OIDC claims missing email/sub', values: {} },
    })
  })

  test('OIDC callback creates a user session after a successful token exchange', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ email: 'oidc-user@example.com', sub: 'user-123' }),
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: {
          cookie: cookieHeader,
          'user-agent': 'OIDC Browser',
          'x-forwarded-for': '203.0.113.44',
        },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/chat')

    const user = await getUserByEmail('oidc-user@example.com')
    expect(user).toBeTruthy()

    const sessionCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    expect(sessionCookie).toBeTruthy()

    const sessionId = parseCookieHeader(firstCookiePair(sessionCookie!)).get(SESSION_COOKIE_NAME)
    const storedSession = await findStoredSession(sessionId!)
    expect(storedSession).toMatchObject({
      userId: user!.id,
      authMethod: 'idp',
      idpConnectionId: 'oidc-1',
    })
  })

  test('OIDC callback returns a conflict when user provisioning hits a duplicate key', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ email: 'duplicate@example.com' }),
    })
    mocks.getOrCreateUserByEmail.mockRejectedValueOnce({
      code: 'SQLITE_CONSTRAINT_UNIQUE',
      constraint: 'User.email',
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'OIDC user provisioning conflict',
        values: { email: 'duplicate@example.com', constraint: 'User.email' },
      },
    })
  })

  test('OIDC callback returns a conflict with a null constraint when none is present', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ email: 'duplicate-null@example.com' }),
    })
    mocks.getOrCreateUserByEmail.mockRejectedValueOnce({
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    })

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'OIDC user provisioning conflict',
        values: { email: 'duplicate-null@example.com', constraint: null },
      },
    })
  })

  test('OIDC callback returns 500 for non-duplicate provisioning failures', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ sub: 'generic-error@example.com' }),
    })
    mocks.getOrCreateUserByEmail.mockRejectedValueOnce(new Error('db down'))

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'OIDC user provisioning failed',
        values: { email: 'generic-error@example.com' },
      },
    })
  })

  test('OIDC callback returns 400 when the token exchange fails', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockRejectedValueOnce(new Error('token exchange failed'))

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'OIDC token exchange failed', values: {} },
    })
  })

  test('OIDC callback handles non-Error token exchange failures', async () => {
    await insertIdpConnection({
      id: 'oidc-1',
      type: 'OIDC',
      config: {
        discoveryUrl: 'https://issuer.example.com/.well-known/openid-configuration',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    })
    const cookieHeader = await buildSsoCookie({
      idp: 'oidc-1',
      state: 'oidc-state',
      code_verifier: 'pkce-verifier',
    })
    mocks.authorizationCodeGrant.mockRejectedValueOnce('token exchange string failure')

    const response = await oidcCallbackRoute.GET(
      new Request('http://localhost/api/oauth/oidc?code=test-code&state=oidc-state', {
        headers: { cookie: cookieHeader },
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'OIDC token exchange failed', values: {} },
    })
  })

  test('SAML callback validates required fields and relay state', async () => {
    const missingRelayState = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        body: new URLSearchParams({ SAMLResponse: 'encoded' }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(missingRelayState.status).toBe(400)
    await expect(missingRelayState.json()).resolves.toEqual({
      error: { message: 'Missing RelayState', values: {} },
    })

    const missingSamlResponse = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        body: new URLSearchParams({ RelayState: '{"connectionId":"saml-1","state":"nonce"}' }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(missingSamlResponse.status).toBe(400)
    await expect(missingSamlResponse.json()).resolves.toEqual({
      error: { message: 'Missing SAMLResponse', values: {} },
    })

    const invalidRelayState = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        body: new URLSearchParams({ RelayState: 'not-json', SAMLResponse: 'encoded' }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(invalidRelayState.status).toBe(400)
    await expect(invalidRelayState.json()).resolves.toEqual({
      error: { message: 'Invalid RelayState', values: {} },
    })
  })

  test('SAML callback rejects unknown and mismatched relay states', async () => {
    const unknownConnectionCookie = await buildSsoCookie({
      idp: 'missing-saml',
      state: 'nonce-1',
    })

    const unknownConnection = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: { cookie: unknownConnectionCookie },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'missing-saml', state: 'nonce-1' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(unknownConnection.status).toBe(400)
    await expect(unknownConnection.json()).resolves.toEqual({
      error: { message: 'Unknown SAML connection', values: {} },
    })

    await insertIdpConnection({
      id: 'saml-1',
      type: 'SAML',
      config: {
        entityID: 'urn:test:idp',
        sso: { postUrl: 'https://idp.example.com/post', redirectUrl: 'https://idp.example.com/redirect' },
        publicKey: 'cert',
      },
    })
    const mismatchedCookie = await buildSsoCookie({
      idp: 'saml-1',
      state: 'nonce-a',
    })

    const mismatchedState = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: { cookie: mismatchedCookie },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'saml-1', state: 'nonce-b' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(mismatchedState.status).toBe(400)
    await expect(mismatchedState.json()).resolves.toEqual({
      error: { message: 'Invalid RelayState', values: {} },
    })
  })

  test('SAML callback handles logout, missing profiles, success, and parser failures', async () => {
    await insertIdpConnection({
      id: 'saml-1',
      type: 'SAML',
      config: {
        entityID: 'urn:test:idp',
        sso: { postUrl: 'https://idp.example.com/post', redirectUrl: 'https://idp.example.com/redirect' },
        publicKey: 'cert',
      },
    })

    mocks.samlValidatePostResponseAsync.mockResolvedValueOnce({ loggedOut: true })
    const logoutCookie = await buildSsoCookie({ idp: 'saml-1', state: 'nonce-1' })
    const logoutResponse = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: { cookie: logoutCookie },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'saml-1', state: 'nonce-1' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(logoutResponse.status).toBe(302)
    expect(logoutResponse.headers.get('location')).toBe('http://localhost:3000/login')

    mocks.samlValidatePostResponseAsync.mockResolvedValueOnce({
      loggedOut: false,
      profile: undefined,
    })
    const missingProfileCookie = await buildSsoCookie({ idp: 'saml-1', state: 'nonce-2' })
    const missingProfileResponse = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: { cookie: missingProfileCookie },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'saml-1', state: 'nonce-2' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(missingProfileResponse.status).toBe(401)
    await expect(missingProfileResponse.json()).resolves.toEqual({
      error: { message: 'SAML user missing', values: {} },
    })

    mocks.samlValidatePostResponseAsync.mockResolvedValueOnce({
      loggedOut: false,
      profile: { mail: 'saml-user@example.com' },
    })
    const successCookie = await buildSsoCookie({ idp: 'saml-1', state: 'nonce-3' })
    const successResponse = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: {
          cookie: successCookie,
          'user-agent': 'SAML Browser',
          'x-forwarded-for': '198.51.100.77',
        },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'saml-1', state: 'nonce-3' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(successResponse.status).toBe(303)
    expect(successResponse.headers.get('location')).toBe('http://localhost:3000/chat')
    const samlUser = await getUserByEmail('saml-user@example.com')
    expect(samlUser).toBeTruthy()

    const sessionCookie = successResponse.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
    const sessionId = parseCookieHeader(firstCookiePair(sessionCookie!)).get(SESSION_COOKIE_NAME)
    const storedSession = await findStoredSession(sessionId!)
    expect(storedSession).toMatchObject({
      userId: samlUser!.id,
      authMethod: 'idp',
      idpConnectionId: 'saml-1',
    })

    const rawSession = await getUserSessionById(samlUser!.id, sessionId!)
    expect(rawSession).toMatchObject({
      userAgent: 'SAML Browser',
      ipAddress: '198.51.100.77',
    })

    mocks.samlValidatePostResponseAsync.mockRejectedValueOnce(new Error('bad assertion'))
    const failingCookie = await buildSsoCookie({ idp: 'saml-1', state: 'nonce-4' })
    const failingResponse = await samlCallbackRoute.POST(
      new Request('http://localhost/api/oauth/saml', {
        method: 'POST',
        headers: { cookie: failingCookie },
        body: new URLSearchParams({
          RelayState: JSON.stringify({ connectionId: 'saml-1', state: 'nonce-4' }),
          SAMLResponse: 'encoded',
        }),
      }),
      { params: Promise.resolve({}) }
    )
    expect(failingResponse.status).toBe(500)
    await expect(failingResponse.json()).resolves.toEqual({
      error: { message: 'SAML callback failed', values: {} },
    })
  })
})
