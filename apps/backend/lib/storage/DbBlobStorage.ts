import { sql } from 'kysely'
import { BaseStorage } from './api'
import type { StorageEncryption, StorageReadOptions } from './api'
import { bufferToReadableStream } from './utils'

/**
 * Read-only storage backed by a `ReplayFileBlob(path, size, bytes)` table in the app database.
 *
 * The offline compression-replay evaluator sets `FILE_STORAGE_LOCATION=replaydb:` so that
 * attachment bytes bundled into its throwaway replay database are served with no external object
 * store and no network. The table is created by the bundle builder
 * (`eval-build-replay-bundle.ts`), never by a migration — it does not exist in a real deployment.
 * Bytes are stored already decrypted, so reads ignore the encryption argument. Writes and deletes
 * throw.
 */
export class DbBlobStorage extends BaseStorage {
  async readStream(
    filePath: string,
    _encryption: StorageEncryption,
    options?: StorageReadOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const { db } = await import('@/db/database')
    const result = await sql<{ bytes: Buffer | Uint8Array }>`
      SELECT "bytes" FROM "ReplayFileBlob" WHERE "path" = ${filePath}
    `.execute(db)
    const row = result.rows[0]
    if (!row) {
      throw new Error(`No ReplayFileBlob row for path ${filePath}`)
    }
    let bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes)
    const { rangeStart, rangeEnd } = options ?? {}
    if (typeof rangeStart === 'number' || typeof rangeEnd === 'number') {
      bytes = bytes.subarray(
        rangeStart ?? 0,
        typeof rangeEnd === 'number' ? rangeEnd + 1 : undefined
      )
    }
    return bufferToReadableStream(bytes)
  }

  async writeStream(): Promise<void> {
    throw new Error('DbBlobStorage is read-only')
  }

  async rm(): Promise<void> {
    throw new Error('DbBlobStorage is read-only')
  }
}
