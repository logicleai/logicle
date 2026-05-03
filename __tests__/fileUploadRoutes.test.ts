import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createHash } from 'node:crypto'
import * as contentRoute from '@/api/files/[fileId]/content/route'

// ── mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  writeStream: vi.fn(),
  readStream: vi.fn(),
  rm: vi.fn(),
  scheduleFileAnalysis: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    writeStream: mocks.writeStream,
    readStream: mocks.readStream,
    rm: mocks.rm,
  },
}))

vi.mock('@/lib/file-analysis', () => ({
  scheduleFileAnalysisForFile: mocks.scheduleFileAnalysis,
}))

// ── DB helpers ────────────────────────────────────────────────────────────────

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
                await (
                  migration as { up: (db: Kysely<any>, dialect?: string) => Promise<void> }
                ).up(client, dialectName)
              },
            } satisfies Migration,
          ])
        ),
    },
  })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

async function resetTables() {
  await db.deleteFrom('FileOwnership').execute()
  await db.deleteFrom('File').execute()
  await db.deleteFrom('Session').execute()
  await db.deleteFrom('User').execute()
}

async function insertFile(params: {
  id: string
  path: string
  uploaded?: 0 | 1
  contentHash?: string | null
}) {
  await db
    .insertInto('File')
    .values({
      id: params.id,
      name: 'test.txt',
      path: params.path,
      type: 'text/plain',
      size: 100,
      uploaded: params.uploaded ?? 0,
      createdAt: new Date().toISOString(),
      encrypted: 0,
      contentHash: params.contentHash ?? null,
    })
    .execute()
}

// Consumes a readable stream so the piped TransformStream (and hash) runs.
async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader()
  for (;;) {
    const { done } = await reader.read()
    if (done) break
  }
}

// ── test state ────────────────────────────────────────────────────────────────

let testUserId: string
let sessionCookie: string

beforeAll(async () => {
  await migrateTestDb()
})

beforeEach(async () => {
  await resetTables()
  mocks.writeStream.mockReset()
  mocks.readStream.mockReset()
  mocks.rm.mockReset()
  mocks.scheduleFileAnalysis.mockReset()

  const user = await createUser({ name: 'Test User', email: 'test@example.com', ssoUser: 0 })
  testUserId = user.id
  const session = await createSession(user.id, new Date(Date.now() + 60_000), 'password', null)
  sessionCookie = `${SESSION_COOKIE_NAME}=${session.id}`
})

// ── PUT /api/files/:fileId/content ────────────────────────────────────────────

describe('PUT /api/files/:fileId/content', () => {
  test('returns 404 when the file does not exist', async () => {
    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/missing/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: 'hello',
      }),
      { params: Promise.resolve({ fileId: 'missing' }) }
    )

    expect(response.status).toBe(404)
  })

  test('returns 400 when the request has no body', async () => {
    await insertFile({ id: 'f1', path: 'f1.txt' })

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/f1/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'f1' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { message: 'Missing body' } })
  })

  test('returns 204 and marks file uploaded for unique content', async () => {
    await insertFile({ id: 'f1', path: 'f1.txt' })
    mocks.writeStream.mockImplementation(
      async (_path: string, stream: ReadableStream<Uint8Array>) => consumeStream(stream)
    )

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/f1/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: 'unique content abc',
      }),
      { params: Promise.resolve({ fileId: 'f1' }) }
    )

    expect(response.status).toBe(204)
    const file = await db.selectFrom('File').selectAll().where('id', '=', 'f1').executeTakeFirst()
    expect(file?.uploaded).toBe(1)
    expect(file?.contentHash).toBeTruthy()
    expect(mocks.scheduleFileAnalysis).toHaveBeenCalledOnce()
  })

  test('returns 200 with canonical ID when content duplicates an existing uploaded file', async () => {
    const content = 'duplicate content xyz'
    const contentHash = createHash('sha256').update(content).digest('hex')

    await insertFile({ id: 'canonical', path: 'canonical.txt', uploaded: 1, contentHash })
    await insertFile({ id: 'new-file', path: 'new-file.txt', uploaded: 0 })
    await db
      .insertInto('FileOwnership')
      .values({
        id: 'own-1',
        fileId: 'new-file',
        ownerType: 'USER',
        ownerId: testUserId,
        createdAt: new Date().toISOString(),
      })
      .execute()

    mocks.writeStream.mockImplementation(
      async (_path: string, stream: ReadableStream<Uint8Array>) => consumeStream(stream)
    )
    mocks.rm.mockResolvedValue(undefined)

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/new-file/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: content,
      }),
      { params: Promise.resolve({ fileId: 'new-file' }) }
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 'canonical' })

    expect(
      await db.selectFrom('File').selectAll().where('id', '=', 'new-file').executeTakeFirst()
    ).toBeUndefined()

    const transferred = await db
      .selectFrom('FileOwnership')
      .selectAll()
      .where('fileId', '=', 'canonical')
      .execute()
    expect(transferred.length).toBeGreaterThan(0)
  })

  test('returns 500 Upload failure when storage write throws a server error', async () => {
    await insertFile({ id: 'f1', path: 'f1.txt' })
    mocks.writeStream.mockRejectedValue(new Error('disk full'))

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/f1/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: 'content',
      }),
      { params: Promise.resolve({ fileId: 'f1' }) }
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: { message: 'Upload failure' } })
  })

  test('returns 500 Upload aborted when client disconnects mid-upload', async () => {
    await insertFile({ id: 'f1', path: 'f1.txt' })

    const controller = new AbortController()
    mocks.writeStream.mockImplementation(async () => {
      controller.abort()
      throw new Error('connection reset')
    })

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/f1/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: 'content',
        signal: controller.signal,
      }),
      { params: Promise.resolve({ fileId: 'f1' }) }
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({ error: { message: 'Upload aborted' } })
  })
})

// ── GET /api/files/:fileId/content ────────────────────────────────────────────

describe('GET /api/files/:fileId/content', () => {
  test('returns 404 when the file does not exist', async () => {
    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/missing/content', {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'missing' }) }
    )

    expect(response.status).toBe(404)
  })

  test('returns 403 when the authenticated user has no ownership of the file', async () => {
    await insertFile({ id: 'f-private', path: 'private.txt', uploaded: 1 })
    await db
      .insertInto('FileOwnership')
      .values({
        id: 'own-1',
        fileId: 'f-private',
        ownerType: 'USER',
        ownerId: 'other-user-id',
        createdAt: new Date().toISOString(),
      })
      .execute()

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-private/content', {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'f-private' }) }
    )

    expect(response.status).toBe(403)
  })

  test('returns 200 with file content when the user owns the file', async () => {
    await insertFile({ id: 'f-mine', path: 'mine.txt', uploaded: 1 })
    await db
      .insertInto('FileOwnership')
      .values({
        id: 'own-1',
        fileId: 'f-mine',
        ownerType: 'USER',
        ownerId: testUserId,
        createdAt: new Date().toISOString(),
      })
      .execute()

    mocks.readStream.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        start(ctrl) {
          ctrl.enqueue(new TextEncoder().encode('file content'))
          ctrl.close()
        },
      })
    )

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-mine/content', {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'f-mine' }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain')
    await expect(response.text()).resolves.toBe('file content')
  })
})
