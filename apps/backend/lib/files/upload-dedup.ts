import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import { nanoid } from 'nanoid'

/**
 * Called after the upload stream has been written to storage.
 * Checks for an existing file with the same content hash.
 * - Duplicate found: transfers ownership rows to the canonical file, deletes the
 *   just-written blob and File row, returns canonical file ID.
 * - No duplicate: links/creates blob and marks the file ready, returns null.
 */
export const finalizeUploadedFile = async (params: {
  fileId: string
  filePath: string
  fileType?: string
  fileSize?: number
  fileEncrypted?: 0 | 1
  contentHash: string
}): Promise<string | null> => {
  const fileRow = await db
    .selectFrom('File')
    .select(['type', 'size', 'encrypted'])
    .where('id', '=', params.fileId)
    .executeTakeFirstOrThrow()

  const timestamp = new Date().toISOString()
  const createdBlobId = nanoid()

  await db
    .insertInto('FileBlob')
    .values({
      id: createdBlobId,
      contentHash: params.contentHash,
      path: params.filePath,
      type: params.fileType ?? fileRow.type,
      size: params.fileSize ?? fileRow.size,
      encrypted: params.fileEncrypted ?? fileRow.encrypted,
      createdAt: timestamp,
    })
    .onConflict((oc) => oc.columns(['contentHash']).doNothing())
    .execute()

  const blob = await db
    .selectFrom('FileBlob')
    .selectAll()
    .where('contentHash', '=', params.contentHash)
    .executeTakeFirstOrThrow()

  if (blob.id !== createdBlobId) {
    await storage.rm(params.filePath)
  }

  await db
    .updateTable('File')
    .set({
      uploaded: 1,
      contentHash: params.contentHash,
      fileBlobId: blob.id,
      path: blob.path,
      type: blob.type,
      size: blob.size,
      encrypted: blob.encrypted,
    })
    .where('id', '=', params.fileId)
    .execute()

  await db
    .updateTable('File')
    .set({
      fileBlobId: blob.id,
    })
    .where('contentHash', '=', params.contentHash)
    .where('fileBlobId', 'is', null)
    .execute()

  return null
}
