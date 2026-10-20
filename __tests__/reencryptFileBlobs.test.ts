import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DB } from '@/db/schema'
import { AeadEncryptingStorage } from '@/ee/AeadEncryptingStorage'
import { MemoryStorage } from '@/lib/storage/MemoryStorage'
import { reencryptFileBlobs } from '@/lib/storage/reencryptFileBlobs'

let db: Kysely<DB>
let raw: MemoryStorage
let storage: AeadEncryptingStorage
const apply = { apply: true, continueOnError: false }

beforeEach(async () => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ database: new Database(':memory:') }) })
  await db.schema
    .createTable('FileBlob')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('contentHash', 'text', (c) => c.notNull())
    .addColumn('path', 'text', (c) => c.notNull())
    .addColumn('type', 'text', (c) => c.notNull())
    .addColumn('size', 'integer', (c) => c.notNull())
    .addColumn('encryption', 'text')
    .addColumn('createdAt', 'text', (c) => c.notNull())
    .execute()
  // In particular, the current File table has no legacy encrypted column.
  await db.schema
    .createTable('File')
    .addColumn('id', 'text', (c) => c.primaryKey())
    .addColumn('fileBlobId', 'text')
    .addColumn('path', 'text', (c) => c.notNull())
    .execute()
  raw = new MemoryStorage()
  storage = await AeadEncryptingStorage.create(raw, 'test-reencryption-key')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await db.destroy()
})

async function seed(id: string, text = 'file contents') {
  const content = Buffer.from(text)
  await storage.writeBuffer(id, content, null)
  await db
    .insertInto('FileBlob')
    .values({
      id,
      path: id,
      contentHash: createHash('sha256').update(content).digest('hex'),
      type: 'text/plain',
      size: content.length,
      encryption: null,
      createdAt: '2026-10-19',
    })
    .execute()
  // Only the columns read by the command are needed in this isolated database.
  await db
    .insertInto('File')
    .values({ id: `file-${id}`, fileBlobId: id, path: id } as DB['File'])
    .execute()
  return content
}

const blob = (id: string) =>
  db.selectFrom('FileBlob').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const ledger = (id: string) =>
  db
    .selectFrom('FileBlobEncryptionRewrite')
    .selectAll()
    .where('fileBlobId', '=', id)
    .executeTakeFirstOrThrow()

test('dry run only reports plaintext backlog and creates no ledger or objects', async () => {
  await seed('plain')
  await reencryptFileBlobs(db, storage, { ...apply, apply: false })
  // biome-ignore lint/suspicious/noConsole: Assert the operator command's structured output.
  expect(console.log).toHaveBeenCalledWith(JSON.stringify({ mode: 'dry-run', count: 1, bytes: 13 }))
  expect((await db.introspection.getTables()).map((t) => t.name)).not.toContain(
    'FileBlobEncryptionRewrite'
  )
  expect(Object.keys(raw.map)).toEqual(['plain'])
  expect((await blob('plain')).encryption).toBeNull()
})

test('verifies real AEAD bytes, updates file references and removes plaintext', async () => {
  const content = await seed('plain')
  await reencryptFileBlobs(db, storage, apply)
  const rewritten = await blob('plain')
  expect(rewritten.encryption).toBe('aead')
  expect(raw.map.plain).toBeUndefined()
  expect(Buffer.from(raw.map[rewritten.path]).subarray(0, 15).toString()).toBe('LOGICLE-AEAD-V1')
  expect(await storage.readBuffer(rewritten.path, 'aead')).toEqual(content)
  expect((await db.selectFrom('File').select('path').executeTakeFirstOrThrow()).path).toBe(
    rewritten.path
  )
  expect((await ledger('plain')).status).toBe('deleted')
})

test('failed verification preserves original references and resumes the prepared rewrite', async () => {
  const content = await seed('plain')
  const read = storage.readBuffer.bind(storage)
  const reads = vi
    .spyOn(storage, 'readBuffer')
    .mockImplementation(async (path, encryption, options) => {
      const result = await read(path, encryption, options)
      return encryption === 'aead' ? Buffer.alloc(result.length, 0) : result
    })
  await expect(reencryptFileBlobs(db, storage, apply)).rejects.toThrow('content hash mismatch')
  expect((await blob('plain')).path).toBe('plain')
  expect(raw.map.plain).toEqual(content)
  const prepared = await ledger('plain')
  expect(prepared.status).toBe('prepared')
  expect(reads.mock.calls.every((call) => call[2]?.bypassCache)).toBe(true)
  reads.mockRestore()
  await reencryptFileBlobs(db, storage, apply)
  expect((await blob('plain')).path).toBe(prepared.newPath)
  expect((await ledger('plain')).status).toBe('deleted')
})

test('cleanup failures retain committed status and are retried without rewriting', async () => {
  await seed('plain')
  const remove = vi.spyOn(storage, 'rm').mockRejectedValue(new Error('storage unavailable'))
  await expect(reencryptFileBlobs(db, storage, apply)).rejects.toThrow('storage unavailable')
  const committed = await ledger('plain')
  expect(committed.status).toBe('committed')
  expect((await blob('plain')).path).toBe(committed.newPath)
  // Also exercise a repeated failure while resuming an already committed ledger.
  await reencryptFileBlobs(db, storage, { ...apply, continueOnError: true })
  expect((await ledger('plain')).status).toBe('committed')
  remove.mockRestore()
  const write = vi.spyOn(storage, 'writeBuffer')
  await reencryptFileBlobs(db, storage, apply)
  expect(write).not.toHaveBeenCalled()
  expect((await ledger('plain')).status).toBe('deleted')
  expect(raw.map.plain).toBeUndefined()
})

test('continue-on-error leaves failed blobs intact and migrates other blobs', async () => {
  await seed('a-bad')
  await seed('b-good')
  await db.updateTable('FileBlob').set({ size: 999 }).where('id', '=', 'a-bad').execute()
  await reencryptFileBlobs(db, storage, { ...apply, continueOnError: true })
  expect((await blob('a-bad')).encryption).toBeNull()
  expect(raw.map['a-bad']).toBeDefined()
  expect((await ledger('a-bad')).lastError).toContain('size mismatch')
  expect((await blob('b-good')).encryption).toBe('aead')
})

test('limit caps new work and encrypted blobs are not rewritten again', async () => {
  await seed('a')
  await seed('b')
  await reencryptFileBlobs(db, storage, { ...apply, limit: 1 })
  const firstPath = (await blob('a')).path
  expect((await blob('b')).encryption).toBeNull()
  await reencryptFileBlobs(db, storage, { ...apply, limit: 1 })
  expect((await blob('a')).path).toBe(firstPath)
  expect((await blob('b')).encryption).toBe('aead')
})

test('cleanup tolerates an already removed filesystem object after interruption', async () => {
  await seed('plain')
  vi.spyOn(storage, 'rm').mockImplementation(async (path) => {
    if (!raw.map[path]) throw Object.assign(new Error('already removed'), { code: 'ENOENT' })
    await raw.rm(path)
    throw new Error('interrupted before recording deletion')
  })
  await expect(reencryptFileBlobs(db, storage, apply)).rejects.toThrow('interrupted')
  expect((await ledger('plain')).status).toBe('committed')
  expect(raw.map.plain).toBeUndefined()
  await reencryptFileBlobs(db, storage, apply)
  expect((await ledger('plain')).status).toBe('deleted')
})

test('does not remove an old object while another blob still references it', async () => {
  await seed('a')
  await seed('b')
  await db.updateTable('FileBlob').set({ path: 'a' }).where('id', '=', 'b').execute()
  await db.updateTable('File').set({ path: 'a' }).where('fileBlobId', '=', 'b').execute()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await reencryptFileBlobs(db, storage, { ...apply, limit: 1 })
  expect(raw.map.a).toBeDefined()
  expect((await ledger('a')).status).toBe('committed')
  expect((await blob('b')).path).toBe('a')
  await reencryptFileBlobs(db, storage, apply)
  expect((await blob('b')).encryption).toBe('aead')
  expect(raw.map.a).toBeUndefined()
})
