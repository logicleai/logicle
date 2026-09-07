import { createHash } from 'node:crypto'
import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import type { StorageEncryption } from '@/lib/storage/api'
import { sql } from 'kysely'
import { nanoid } from 'nanoid'

const TARGET_ENCRYPTION: StorageEncryption = 'aead'
const LEDGER_TABLE = 'FileBlobEncryptionRewrite'

type Options = {
  apply: boolean
  limit?: number
}

type BlobRow = {
  id: string
  contentHash: string
  path: string
  type: string
  size: number
  encryption: StorageEncryption
}

type LedgerRow = {
  fileBlobId: string
  oldPath: string
  newPath: string
  status: 'prepared' | 'committed' | 'deleted'
}

const usage = () => {
  console.error('Usage: reencrypt-file-blobs [--apply] [--limit N]')
  console.error('Without --apply the command only reports the plaintext backlog.')
}

const parseOptions = (): Options => {
  const args = process.argv.slice(2)
  let apply = false
  let limit: number | undefined
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--apply') {
      apply = true
      continue
    }
    if (arg === '--limit') {
      const value = Number(args[++index])
      if (!Number.isSafeInteger(value) || value <= 0) {
        usage()
        process.exit(2)
      }
      limit = value
      continue
    }
    usage()
    process.exit(2)
  }
  return { apply, limit }
}

const hash = (buffer: Uint8Array) => createHash('sha256').update(buffer).digest('hex')

const makeNewPath = (blob: BlobRow) => {
  const suffix = blob.path.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120)
  return `reencrypted-${nanoid()}-${suffix || 'file'}`
}

const ensureLedger = async () => {
  await (db as any).schema
    .createTable(LEDGER_TABLE)
    .ifNotExists()
    .addColumn('fileBlobId', 'text', (column: any) => column.notNull().primaryKey())
    .addColumn('oldPath', 'text', (column: any) => column.notNull())
    .addColumn('newPath', 'text', (column: any) => column.notNull())
    .addColumn('status', 'text', (column: any) => column.notNull())
    .addColumn('lastError', 'text')
    .addColumn('createdAt', 'text', (column: any) => column.notNull())
    .addColumn('updatedAt', 'text', (column: any) => column.notNull())
    .execute()
}

const acquireLock = async () => {
  await sql`select pg_advisory_lock(hashtext('logicle:fileblob-reencrypt'))`.execute(db)
}

const releaseLock = async () => {
  await sql`select pg_advisory_unlock(hashtext('logicle:fileblob-reencrypt'))`.execute(db)
}

const countPlaintext = async () => {
  const result = await db
    .selectFrom('FileBlob')
    .select(({ fn }) => [fn.countAll<number>().as('count'), fn.sum<number>('size').as('bytes')])
    .where('encryption', 'is', null)
    .executeTakeFirstOrThrow()
  return { count: Number(result.count), bytes: Number(result.bytes ?? 0) }
}

const verifyBuffer = (source: Buffer, rewritten: Buffer, blob: BlobRow) => {
  if (source.length !== blob.size || rewritten.length !== blob.size) {
    throw new Error(
      `size mismatch for ${blob.id}: db=${blob.size} source=${source.length} rewritten=${rewritten.length}`
    )
  }
  const sourceHash = hash(source)
  const rewrittenHash = hash(rewritten)
  if (sourceHash !== rewrittenHash) {
    throw new Error(`content hash mismatch for ${blob.id}: ${sourceHash} != ${rewrittenHash}`)
  }
  if (/^[0-9a-f]{64}$/i.test(blob.contentHash) && sourceHash !== blob.contentHash) {
    throw new Error(
      `database contentHash mismatch for ${blob.id}: ${sourceHash} != ${blob.contentHash}`
    )
  }
}

const getLedger = async (fileBlobId: string): Promise<LedgerRow | undefined> => {
  return (await (db as any)
    .selectFrom(LEDGER_TABLE)
    .select(['fileBlobId', 'oldPath', 'newPath', 'status'])
    .where('fileBlobId', '=', fileBlobId)
    .executeTakeFirst()) as LedgerRow | undefined
}

const getPendingLedgers = async (): Promise<LedgerRow[]> => {
  return (await (db as any)
    .selectFrom(LEDGER_TABLE)
    .select(['fileBlobId', 'oldPath', 'newPath', 'status'])
    .where('status', 'in', ['prepared', 'committed'])
    .orderBy('createdAt', 'asc')
    .execute()) as LedgerRow[]
}

const recordLedger = async (values: {
  fileBlobId: string
  oldPath: string
  newPath: string
  status: LedgerRow['status']
  lastError?: string | null
}) => {
  const now = new Date().toISOString()
  await (db as any)
    .insertInto(LEDGER_TABLE)
    .values({ ...values, createdAt: now, updatedAt: now })
    .onConflict((oc: any) =>
      oc.column('fileBlobId').doUpdateSet({
        oldPath: values.oldPath,
        newPath: values.newPath,
        status: values.status,
        lastError: values.lastError ?? null,
        updatedAt: now,
      })
    )
    .execute()
}

const markLedger = async (
  fileBlobId: string,
  status: LedgerRow['status'],
  lastError: string | null = null
) => {
  await (db as any)
    .updateTable(LEDGER_TABLE)
    .set({ status, lastError, updatedAt: new Date().toISOString() })
    .where('fileBlobId', '=', fileBlobId)
    .execute()
}

const cleanupCommittedLedger = async (ledger: LedgerRow) => {
  const blob = await db
    .selectFrom('FileBlob')
    .select(['path', 'encryption'])
    .where('id', '=', ledger.fileBlobId)
    .executeTakeFirst()

  if (!blob || blob.path !== ledger.newPath || blob.encryption !== TARGET_ENCRYPTION) {
    throw new Error(
      `refusing to delete ${ledger.oldPath}: FileBlob ${ledger.fileBlobId} is not committed to ${ledger.newPath}`
    )
  }

  if (ledger.oldPath !== ledger.newPath) {
    const references = await db
      .selectFrom('FileBlob')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('path', '=', ledger.oldPath)
      .executeTakeFirstOrThrow()
    if (Number(references.count) > 0) {
      console.warn(
        JSON.stringify({
          action: 'defer-old-object-delete',
          fileBlobId: ledger.fileBlobId,
          oldPath: ledger.oldPath,
          references: Number(references.count),
        })
      )
      return
    }
    await storage.rm(ledger.oldPath)
  }
  await markLedger(ledger.fileBlobId, 'deleted')
}

const rewriteOne = async (blob: BlobRow) => {
  const ledger = await getLedger(blob.id)
  const oldPath = ledger?.oldPath ?? blob.path
  const newPath = ledger?.newPath ?? makeNewPath(blob)

  await recordLedger({ fileBlobId: blob.id, oldPath, newPath, status: 'prepared' })

  const source = await storage.readBuffer(oldPath, null)
  await storage.writeBuffer(newPath, source, TARGET_ENCRYPTION)
  const rewritten = await storage.readBuffer(newPath, TARGET_ENCRYPTION)
  verifyBuffer(source, rewritten, blob)

  await db.transaction().execute(async (trx) => {
    const current = await trx
      .selectFrom('FileBlob')
      .select(['path', 'encryption'])
      .where('id', '=', blob.id)
      .executeTakeFirstOrThrow()
    if (current.encryption !== null) {
      return
    }
    await trx
      .updateTable('FileBlob')
      .set({ path: newPath, encryption: TARGET_ENCRYPTION })
      .where('id', '=', blob.id)
      .where('encryption', 'is', null)
      .execute()
    await trx
      .updateTable('File')
      .set({ path: newPath, encrypted: 1 } as any)
      .where('fileBlobId', '=', blob.id)
      .execute()
    await (trx as any)
      .updateTable(LEDGER_TABLE)
      .set({ status: 'committed', lastError: null, updatedAt: new Date().toISOString() })
      .where('fileBlobId', '=', blob.id)
      .execute()
  })
  await cleanupCommittedLedger({ fileBlobId: blob.id, oldPath, newPath, status: 'committed' })
}

const resumePendingLedgers = async () => {
  for (const ledger of await getPendingLedgers()) {
    if (ledger.status === 'committed') {
      await cleanupCommittedLedger(ledger)
      continue
    }

    const blob = await db
      .selectFrom('FileBlob')
      .select(['id', 'contentHash', 'path', 'type', 'size', 'encryption'])
      .where('id', '=', ledger.fileBlobId)
      .executeTakeFirst()
    if (!blob) {
      throw new Error(`FileBlob ${ledger.fileBlobId} from rewrite ledger no longer exists`)
    }
    if (blob.encryption === TARGET_ENCRYPTION && blob.path === ledger.newPath) {
      await markLedger(ledger.fileBlobId, 'committed')
      await cleanupCommittedLedger({ ...ledger, status: 'committed' })
      continue
    }
    if (blob.encryption !== null) {
      throw new Error(
        `refusing to resume ${ledger.fileBlobId}: unexpected encryption ${String(blob.encryption)}`
      )
    }
    await rewriteOne(blob as BlobRow)
  }
}

const main = async () => {
  const options = parseOptions()
  if (!options.apply) {
    const backlog = await countPlaintext()
    console.log(JSON.stringify({ mode: 'dry-run', ...backlog }))
    await db.destroy()
    return
  }

  await ensureLedger()
  await acquireLock()
  try {
    const backlog = await countPlaintext()
    console.log(JSON.stringify({ mode: 'apply', ...backlog }))
    await resumePendingLedgers()

    let query = db
      .selectFrom('FileBlob')
      .select(['id', 'contentHash', 'path', 'type', 'size', 'encryption'])
      .where('encryption', 'is', null)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
    if (options.limit) query = query.limit(options.limit) as typeof query
    const blobs = (await query.execute()) as BlobRow[]
    for (const [index, blob] of blobs.entries()) {
      console.log(
        JSON.stringify({
          action: 'rewrite',
          index: index + 1,
          total: blobs.length,
          id: blob.id,
          size: blob.size,
        })
      )
      try {
        await rewriteOne(blob)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await markLedger(blob.id, 'prepared', message).catch(() => undefined)
        throw new Error(`blob ${blob.id} failed: ${message}`)
      }
    }
  } finally {
    await releaseLock()
    await db.destroy()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
