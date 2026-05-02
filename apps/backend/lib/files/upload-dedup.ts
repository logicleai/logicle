import { db } from '@/db/database'
import { storage } from '@/lib/storage'

/**
 * Called after the upload stream has been written to storage.
 * Checks for an existing file with the same content hash.
 * - Duplicate found: deletes the just-written blob and File row, returns canonical file ID.
 * - No duplicate: marks the file as uploaded with its hash, returns null.
 */
export const finalizeUploadedFile = async (params: {
  fileId: string
  filePath: string
  contentHash: string
}): Promise<string | null> => {
  const duplicate = await db
    .selectFrom('File')
    .select(['id'])
    .where('contentHash', '=', params.contentHash)
    .where('id', '!=', params.fileId)
    .where('uploaded', '=', 1)
    .executeTakeFirst()

  if (duplicate) {
    await storage.rm(params.filePath)
    await db.deleteFrom('File').where('id', '=', params.fileId).execute()
    return duplicate.id
  }

  await db
    .updateTable('File')
    .set({ uploaded: 1, contentHash: params.contentHash })
    .where('id', '=', params.fileId)
    .execute()
  return null
}
