import type { DB } from '@/db/schema'
import { db } from '@/db/database'
import env from '@/lib/env'
import { logger, type LoggerLike } from '@/lib/logging'
import { storage } from '@/lib/storage'
import { type Kysely } from 'kysely'

interface OrphanFileCandidate {
  id: string
  path: string
  encrypted: 0 | 1
}

export interface OrphanCleanupSummary {
  mode: 'dry-run' | 'delete'
  scanned: number
  deleted: number
  failed: number
}

interface OrphanCleanupDeps {
  db: Kysely<DB>
  storage: Pick<typeof storage, 'rm'>
  logger: Pick<LoggerLike, 'info' | 'warn' | 'error'>
}

const getDependencies = (): OrphanCleanupDeps => ({
  db,
  storage,
  logger,
})

export const findOrphanFiles = async (
  batchSize: number,
  deps: Pick<OrphanCleanupDeps, 'db'> = getDependencies()
): Promise<OrphanFileCandidate[]> => {
  return await deps.db
    .selectFrom('File')
    .leftJoin('FileOwnership', 'FileOwnership.fileId', 'File.id')
    .select(['File.id as id', 'File.path as path', 'File.encrypted as encrypted'])
    .where('FileOwnership.id', 'is', null)
    .limit(batchSize)
    .execute()
}

const hasOwnership = async (
  fileId: string,
  deps: Pick<OrphanCleanupDeps, 'db'>
): Promise<boolean> => {
  const row = await deps.db
    .selectFrom('FileOwnership')
    .select('id')
    .where('fileId', '=', fileId)
    .executeTakeFirst()
  return Boolean(row)
}

const deleteOrphanFile = async (
  file: OrphanFileCandidate,
  deps: OrphanCleanupDeps
): Promise<'deleted' | 'failed'> => {
  if (await hasOwnership(file.id, deps)) {
    deps.logger.info('[file-orphan-cleanup] skipping file that gained ownership', { fileId: file.id })
    return 'failed'
  }

  await deps.storage.rm(file.path)

  const result = await deps.db.deleteFrom('File').where('id', '=', file.id).executeTakeFirst()
  if (Number(result.numDeletedRows ?? 0) !== 1) {
    deps.logger.warn('[file-orphan-cleanup] expected to delete exactly one file row', {
      fileId: file.id,
      numDeletedRows: Number(result.numDeletedRows ?? 0),
    })
    return 'failed'
  }

  return 'deleted'
}

export const runFileOrphanCleanupPass = async (
  mode: 'dry-run' | 'delete',
  deps: OrphanCleanupDeps = getDependencies()
): Promise<OrphanCleanupSummary> => {
  const batchSize = Math.max(1, env.fileOrphanCleanup.batchSize)
  const candidates = await findOrphanFiles(batchSize, deps)
  const summary: OrphanCleanupSummary = {
    mode,
    scanned: candidates.length,
    deleted: 0,
    failed: 0,
  }

  if (mode === 'dry-run') {
    deps.logger.info('[file-orphan-cleanup] dry-run completed', {
      ...summary,
      candidateFileIds: candidates.map((file) => file.id),
    })
    return summary
  }

  for (const file of candidates) {
    try {
      const status = await deleteOrphanFile(file, deps)
      if (status === 'deleted') {
        summary.deleted += 1
      } else {
        summary.failed += 1
      }
    } catch (err) {
      summary.failed += 1
      deps.logger.error('[file-orphan-cleanup] failed deleting orphan file', {
        fileId: file.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  deps.logger.info('[file-orphan-cleanup] delete pass completed', summary)
  return summary
}

export const startFileOrphanCleanupRuntime = () => {
  // Not ready: legacy File rows have no FileOwnership rows and would be
  // incorrectly treated as orphans. A backfill migration is required before
  // this job can run safely.
  logger.warn('[file-orphan-cleanup] runtime is disabled pending ownership backfill migration — no files will be cleaned up')
}

