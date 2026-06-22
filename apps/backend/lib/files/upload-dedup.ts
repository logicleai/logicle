import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import { isFileEncrypted, type StoredFileEncryption } from '@/lib/storage/encryption'
import { nanoid } from 'nanoid'

/**
 * Called after the upload stream has been written to storage.
 * Inserts or reuses a FileBlob row for the given content hash, then marks the
 * File row as uploaded and links it to the canonical blob. If a blob with the
 * same hash already existed, the redundant storage object is deleted.
 */
export const finalizeUploadedFile = async (params: {
  fileId: string
  filePath: string
  fileType: string
  fileSize: number
  fileEncrypted: StoredFileEncryption | null
  contentHash: string
}): Promise<void> => {
  const timestamp = new Date().toISOString()
  const createdBlobId = nanoid()

  await db
    .insertInto('FileBlob')
    .values({
      id: createdBlobId,
      contentHash: params.contentHash,
      path: params.filePath,
      type: params.fileType,
      size: params.fileSize,
      encryption: params.fileEncrypted,
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
      origin: 'uploaded',
      uploaded: 1,
      fileBlobId: blob.id,
      path: blob.path,
      type: blob.type,
      size: blob.size,
      encrypted: isFileEncrypted(blob.encryption) ? 1 : 0,
    } as any)
    .where('id', '=', params.fileId)
    .execute()

}
