import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter, sql } from 'kysely'
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
  await db.deleteFrom('File').execute()
  await db.deleteFrom('Session').execute()
  await db.deleteFrom('User').execute()
}

async function insertFile(params: {
  id: string
  path: string
  ownerType?: 'USER' | 'CHAT' | 'ASSISTANT' | 'TOOL'
  ownerId?: string
}) {
  await sql`
    INSERT INTO "File" ("id", "name", "path", "type", "size", "uploaded", "createdAt", "encrypted", "fileBlobId", "ownerType", "ownerId")
    VALUES (${params.id}, ${'test.txt'}, ${params.path}, ${'text/plain'}, ${100}, ${0}, ${new Date().toISOString()}, ${0}, NULL, ${params.ownerType ?? 'USER'}, ${params.ownerId ?? 'u1'})
  `.execute(db)
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

  test('returns 204 and links blob for unique content', async () => {
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
    expect(file?.fileBlobId).toBeTruthy()
    expect(mocks.scheduleFileAnalysis).toHaveBeenCalledOnce()
  })

  test('returns 204 when content duplicates an existing blob', async () => {
    const content = 'duplicate content xyz'
    const contentHash = createHash('sha256').update(content).digest('hex')

    await insertFile({ id: 'canonical', path: 'canonical.txt' })
    await insertFile({ id: 'new-file', path: 'new-file.txt' })
    await db
      .insertInto('FileBlob')
      .values({
        id: 'canonical',
        contentHash,
        path: 'canonical.txt',
        type: 'text/plain',
        size: 100,
        encrypted: 0,
        createdAt: new Date().toISOString(),
      })
      .execute()
    await db.updateTable('File').set({ fileBlobId: 'canonical' }).where('id', '=', 'canonical').execute()

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

    expect(response.status).toBe(204)

    const canonicalFile = await db
      .selectFrom('File')
      .selectAll()
      .where('id', '=', 'canonical')
      .executeTakeFirstOrThrow()
    const newFile = await db
      .selectFrom('File')
      .selectAll()
      .where('id', '=', 'new-file')
      .executeTakeFirstOrThrow()

    expect(newFile.fileBlobId).toBeTruthy()
    expect(newFile.fileBlobId).toEqual(canonicalFile.fileBlobId)
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
    await insertFile({ id: 'f-private', path: 'private.txt', ownerId: 'other-user-id' })

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-private/content', {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'f-private' }) }
    )

    expect(response.status).toBe(403)
  })

  test('returns 200 with file content when the user owns the file', async () => {
    await insertFile({ id: 'f-mine', path: 'mine.txt', ownerId: testUserId })

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
