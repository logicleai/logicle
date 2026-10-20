// biome-ignore-all lint/suspicious/noConsole: Operator command emits structured progress.
import { createHash } from 'node:crypto'
import type { Kysely } from 'kysely'
import { nanoid } from 'nanoid'
import type { DB, FileBlobEncryptionRewrite } from '@/db/schema'
import type { Storage, StorageEncryption } from './api'

const TARGET_ENCRYPTION: StorageEncryption = 'aead'
const LEDGER_TABLE = 'FileBlobEncryptionRewrite'

export type ReencryptOptions = {
  apply: boolean
  limit?: number
  continueOnError: boolean
}

type BlobRow = Pick<DB['FileBlob'], 'id' | 'contentHash' | 'path' | 'type' | 'size' | 'encryption'>

type LedgerRow = Pick<FileBlobEncryptionRewrite, 'fileBlobId' | 'oldPath' | 'newPath' | 'status'>

// The rewrite ledger is created only by this operator command, never at app startup.
export async function reencryptFileBlobs(
  db: Kysely<DB>,
  storage: Storage,
  options: ReencryptOptions
) {
  const hash = (buffer: Uint8Array) => createHash('sha256').update(buffer).digest('hex')

  const makeNewPath = (blob: BlobRow) => {
    const suffix = blob.path.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120)
    return `reencrypted-${nanoid()}-${suffix || 'file'}`
  }

  const ensureLedger = async () => {
    await db.schema
      .createTable(LEDGER_TABLE)
      .ifNotExists()
      .addColumn('fileBlobId', 'text', (column) => column.notNull().primaryKey())
      .addColumn('oldPath', 'text', (column) => column.notNull())
      .addColumn('newPath', 'text', (column) => column.notNull())
      .addColumn('status', 'text', (column) => column.notNull())
      .addColumn('lastError', 'text')
      .addColumn('createdAt', 'text', (column) => column.notNull())
      .addColumn('updatedAt', 'text', (column) => column.notNull())
      .execute()
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
    return (await db
      .selectFrom(LEDGER_TABLE)
      .select(['fileBlobId', 'oldPath', 'newPath', 'status'])
      .where('fileBlobId', '=', fileBlobId)
      .executeTakeFirst()) as LedgerRow | undefined
  }

  const getPendingLedgers = async (): Promise<LedgerRow[]> => {
    return (await db
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
    await db
      .insertInto(LEDGER_TABLE)
      .values({ ...values, createdAt: now, updatedAt: now })
      .onConflict((oc) =>
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
    await db
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
      try {
        await storage.rm(ledger.oldPath)
      } catch (error) {
        // A previous run may have deleted the object before recording completion.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    await markLedger(ledger.fileBlobId, 'deleted')
  }

  const rewriteOne = async (blob: BlobRow) => {
    const ledger = await getLedger(blob.id)
    const oldPath = ledger?.oldPath ?? blob.path
    const newPath = ledger?.newPath ?? makeNewPath(blob)

    await recordLedger({ fileBlobId: blob.id, oldPath, newPath, status: 'prepared' })

    const source = await storage.readBuffer(oldPath, null, { bypassCache: true })
    await storage.writeBuffer(newPath, source, TARGET_ENCRYPTION)
    const rewritten = await storage.readBuffer(newPath, TARGET_ENCRYPTION, { bypassCache: true })
    verifyBuffer(source, rewritten, blob)

    await db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('FileBlob')
        .select(['path', 'encryption'])
        .where('id', '=', blob.id)
        .executeTakeFirstOrThrow()
      if (current.encryption !== null || current.path !== oldPath) {
        throw new Error(`FileBlob ${blob.id} changed during rewrite`)
      }
      await trx
        .updateTable('FileBlob')
        .set({ path: newPath, encryption: TARGET_ENCRYPTION })
        .where('id', '=', blob.id)
        .where('encryption', 'is', null)
        .execute()
      await trx
        .updateTable('File')
        .set({ path: newPath })
        .where('fileBlobId', '=', blob.id)
        .execute()
      await trx
        .updateTable(LEDGER_TABLE)
        .set({ status: 'committed', lastError: null, updatedAt: new Date().toISOString() })
        .where('fileBlobId', '=', blob.id)
        .execute()
    })
    await cleanupCommittedLedger({ fileBlobId: blob.id, oldPath, newPath, status: 'committed' })
  }

  const resumePendingLedgers = async (continueOnError: boolean) => {
    for (const ledger of await getPendingLedgers()) {
      try {
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
            `refusing to resume ${ledger.fileBlobId}: unexpected encryption ${String(
              blob.encryption
            )}`
          )
        }
        await rewriteOne(blob)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await recordError(ledger.fileBlobId, message)
        if (!continueOnError) throw error
        console.error(
          JSON.stringify({ action: 'rewrite-error', fileBlobId: ledger.fileBlobId, error: message })
        )
      }
    }
  }

  const recordError = async (fileBlobId: string, message: string) => {
    await db
      .updateTable(LEDGER_TABLE)
      .set({ lastError: message, updatedAt: new Date().toISOString() })
      .where('fileBlobId', '=', fileBlobId)
      .execute()
  }

  if (!options.apply) {
    const backlog = await countPlaintext()
    console.log(JSON.stringify({ mode: 'dry-run', ...backlog }))
    return
  }
  await ensureLedger()
  const backlog = await countPlaintext()
  console.log(JSON.stringify({ mode: 'apply', ...backlog }))
  await resumePendingLedgers(options.continueOnError)

  let query = db
    .selectFrom('FileBlob')
    .select(['id', 'contentHash', 'path', 'type', 'size', 'encryption'])
    .where('encryption', 'is', null)
    .orderBy('createdAt', 'asc')
    .orderBy('id', 'asc')
  if (options.limit) query = query.limit(options.limit) as typeof query
  const blobs = await query.execute()
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
      await recordError(blob.id, message)
      if (!options.continueOnError) throw new Error(`blob ${blob.id} failed: ${message}`)
      console.error(
        JSON.stringify({ action: 'rewrite-error', fileBlobId: blob.id, error: message })
      )
    }
  }
}
