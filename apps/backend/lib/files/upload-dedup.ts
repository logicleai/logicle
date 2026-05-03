import { db } from '@/db/database'
import { storage } from '@/lib/storage'
import { nanoid } from 'nanoid'

/**
 * Called after the upload stream has been written to storage.
 * Checks for an existing file with the same content hash.
 * - Duplicate found: transfers ownership rows to the canonical file, deletes the
 *   just-written blob and File row, returns canonical file ID.
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
    const ownerships = await db
      .selectFrom('FileOwnership')
      .select(['ownerType', 'ownerId'])
      .where('fileId', '=', params.fileId)
      .execute()

    if (ownerships.length > 0) {
      const timestamp = new Date().toISOString()
      for (const o of ownerships) {
        await db
          .insertInto('FileOwnership')
          .values({
            id: nanoid(),
            fileId: duplicate.id,
            ownerType: o.ownerType,
            ownerId: o.ownerId,
            createdAt: timestamp,
          })
          .onConflict((oc) => oc.columns(['fileId', 'ownerType', 'ownerId']).doNothing())
          .execute()
      }
    }

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
