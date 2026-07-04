import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { Kysely, Migrator, type Migration, PostgresAdapter, SqliteAdapter, sql } from 'kysely'
import { db } from '@/db/database'
import { migrationModules } from '@/db/migrations.generated'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { createSession } from '@/models/session'
import { createUser } from '@/models/user'
import { createHash } from 'node:crypto'
import * as contentRoute from '@/api/files/[fileId]/content/route'
import * as filesRoute from '@/api/files/route'

// ── mocks ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  writeStream: vi.fn(),
  readStream: vi.fn(),
  rm: vi.fn(),
  supportsRangeReads: vi.fn(),
  scheduleFileAnalysis: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
  storage: {
    writeStream: mocks.writeStream,
    readStream: mocks.readStream,
    rm: mocks.rm,
    supportsRangeReads: mocks.supportsRangeReads,
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
  await db.deleteFrom('FileBlob').execute()
  await db.deleteFrom('Conversation').execute()
  await db.deleteFrom('AssistantVersion').execute()
  await db.deleteFrom('Assistant').execute()
  await db.deleteFrom('Backend').execute()
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
    VALUES (${params.id}, ${'test.txt'}, ${params.path}, ${'text/plain'}, ${100}, ${0}, ${new Date().toISOString()}, ${0}, NULL, ${params.ownerType ?? 'USER'}, ${params.ownerId ?? testUserId})
  `.execute(db)
}

async function insertConversation(params: { id: string; ownerId: string }) {
  await db
    .insertInto('Backend')
    .values({
      id: 'backend-for-chat-upload',
      name: 'Backend',
      providerType: 'openai',
      configuration: '{}',
      provisioned: 0,
    })
    .execute()
  await db
    .insertInto('Assistant')
    .values({
      id: 'assistant-for-chat-upload',
      draftVersionId: null,
      publishedVersionId: null,
      provisioned: 0,
      deleted: 0,
      hidden: 0,
      owner: params.ownerId,
    })
    .execute()
  await db
    .insertInto('Conversation')
    .values({
      id: params.id,
      name: 'Chat upload test',
      assistantId: 'assistant-for-chat-upload',
      ownerId: params.ownerId,
      createdAt: new Date().toISOString(),
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
  mocks.supportsRangeReads.mockReset()
  mocks.scheduleFileAnalysis.mockReset()
  mocks.supportsRangeReads.mockReturnValue(true)

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

  test('returns 403 when uploading content to a file the user cannot access', async () => {
    await insertFile({ id: 'f-private', path: 'private.txt', ownerType: 'USER', ownerId: 'other-user' })

    const response = await contentRoute.PUT(
      new Request('http://localhost/api/files/f-private/content', {
        method: 'PUT',
        headers: { cookie: sessionCookie },
        body: 'content',
      }),
      { params: Promise.resolve({ fileId: 'f-private' }) }
    )

    expect(response.status).toBe(403)
    expect(mocks.writeStream).not.toHaveBeenCalled()
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
        encryption: null,
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

// ── POST /api/files ──────────────────────────────────────────────────────────

describe('POST /api/files', () => {
  test('creates chat upload metadata with CHAT ownership', async () => {
    await insertConversation({ id: 'chat-1', ownerId: testUserId })

    const response = await filesRoute.POST(
      new Request('http://localhost/api/files', {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'chat-upload.txt',
          type: 'text/plain',
          size: 12,
          owner: { ownerType: 'CHAT', ownerId: 'chat-1' },
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    const file = await db
      .selectFrom('File')
      .select(['ownerType', 'ownerId'])
      .where('id', '=', body.id)
      .executeTakeFirstOrThrow()
    expect(file).toEqual({ ownerType: 'CHAT', ownerId: 'chat-1' })
  })

  test('returns 403 when creating metadata for an owner the user cannot access', async () => {
    const response = await filesRoute.POST(
      new Request('http://localhost/api/files', {
        method: 'POST',
        headers: {
          cookie: sessionCookie,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'private.txt',
          type: 'text/plain',
          size: 12,
          owner: { ownerType: 'USER', ownerId: 'other-user' },
        }),
      }),
      { params: Promise.resolve({}) }
    )

    expect(response.status).toBe(403)
  })
})

// ── GET /api/files/:fileId/content ────────────────────────────────────────────

async function insertFileWithBlob(params: {
  fileId: string
  blobId: string
  path: string
  size: number
  encryption: 'aead' | 'pgp' | null
}) {
  await db
    .insertInto('FileBlob')
    .values({
      id: params.blobId,
      contentHash: 'a'.repeat(64),
      path: params.path,
      type: 'text/plain',
      size: params.size,
      encryption: params.encryption,
      createdAt: new Date().toISOString(),
    })
    .execute()
  await sql`
    INSERT INTO "File" ("id", "name", "path", "type", "size", "uploaded", "createdAt", "encrypted", "fileBlobId", "ownerType", "ownerId")
    VALUES (${params.fileId}, ${'test.txt'}, ${params.path}, ${'text/plain'}, ${params.size}, ${0}, ${new Date().toISOString()}, ${0}, ${params.blobId}, ${'USER'}, ${testUserId})
  `.execute(db)
}

function makeStream(content: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(new TextEncoder().encode(content))
      ctrl.close()
    },
  })
}

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

    mocks.readStream.mockResolvedValue(makeStream('file content'))

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

  test('returns 200 with Accept-Ranges: bytes for an AEAD file without a Range header', async () => {
    await insertFileWithBlob({ fileId: 'f-aead', blobId: 'b-aead', path: 'aead.txt', size: 100, encryption: 'aead' })
    mocks.readStream.mockResolvedValue(makeStream('full content'))

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-aead/content', {
        headers: { cookie: sessionCookie },
      }),
      { params: Promise.resolve({ fileId: 'f-aead' }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
  })

  test('returns 206 with Content-Range for a valid range request on an AEAD file', async () => {
    await insertFileWithBlob({ fileId: 'f-aead', blobId: 'b-aead', path: 'aead.txt', size: 100, encryption: 'aead' })
    mocks.readStream.mockResolvedValue(makeStream('0123456789'))

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-aead/content', {
        headers: { cookie: sessionCookie, range: 'bytes=10-19' },
      }),
      { params: Promise.resolve({ fileId: 'f-aead' }) }
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 10-19/100')
    expect(response.headers.get('content-length')).toBe('10')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(mocks.readStream).toHaveBeenCalledWith('aead.txt', 'aead', {
      expectedSizeBytes: 100,
      rangeStart: 10,
      rangeEnd: 19,
    })
  })

  test('returns 416 for an unsatisfiable range on an AEAD file', async () => {
    await insertFileWithBlob({ fileId: 'f-aead', blobId: 'b-aead', path: 'aead.txt', size: 100, encryption: 'aead' })

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-aead/content', {
        headers: { cookie: sessionCookie, range: 'bytes=200-299' },
      }),
      { params: Promise.resolve({ fileId: 'f-aead' }) }
    )

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */100')
    expect(mocks.readStream).not.toHaveBeenCalled()
  })

  test('returns 206 when a Range header is sent for a plaintext file', async () => {
    await insertFileWithBlob({ fileId: 'f-plain', blobId: 'b-plain', path: 'plain.txt', size: 100, encryption: null })
    mocks.readStream.mockResolvedValue(makeStream('full content'))

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-plain/content', {
        headers: { cookie: sessionCookie, range: 'bytes=0-9' },
      }),
      { params: Promise.resolve({ fileId: 'f-plain' }) }
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 0-9/100')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(mocks.readStream).toHaveBeenCalledWith('plain.txt', null, {
      expectedSizeBytes: 100,
      rangeStart: 0,
      rangeEnd: 9,
    })
  })

  test('returns 200 when the storage backend rejects range reads', async () => {
    mocks.supportsRangeReads.mockReturnValue(false)
    await insertFileWithBlob({ fileId: 'f-pgp', blobId: 'b-pgp', path: 'pgp.txt', size: 100, encryption: 'pgp' })
    mocks.readStream.mockResolvedValue(makeStream('full content'))

    const response = await contentRoute.GET(
      new Request('http://localhost/api/files/f-pgp/content', {
        headers: { cookie: sessionCookie, range: 'bytes=0-9' },
      }),
      { params: Promise.resolve({ fileId: 'f-pgp' }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('accept-ranges')).toBe('none')
    expect(mocks.readStream).toHaveBeenCalledWith('pgp.txt', 'pgp', { expectedSizeBytes: 100 })
  })
})
