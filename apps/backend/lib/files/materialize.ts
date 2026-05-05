import { db } from '@/db/database'
import type { FileDbRow } from '@/backend/models/file'
import type { FileOwnerType } from '@/db/schema'
import env from '@/lib/env'
import { storage } from '@/lib/storage'
import { nanoid } from 'nanoid'
import { createHash } from 'node:crypto'

export interface FileOwnerRef {
  ownerType: FileOwnerType
  ownerId: string
}

export interface MaterializeFileParams {
  content: Buffer | Uint8Array
  name: string
  mimeType: string
  owner: FileOwnerRef
}

const sanitizePathSegment = (value: string): string => {
  return value.replace(/(\W+)/gi, '-')
}

const hashContent = (content: Buffer | Uint8Array): string => {
  return createHash('sha256').update(content).digest('hex')
}

const getFileWithId = async (id: string): Promise<FileDbRow | undefined> => {
  return await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
}

/**
 * Persist file content and logical ownership with deduplication.
 * The same bytes map to one FileBlob row (by contentHash), while each materialized
 * logical File carries a single owner.
 */
export const materializeFile = async (params: MaterializeFileParams): Promise<FileDbRow> => {
  const contentHash = hashContent(params.content)
  const timestamp = new Date().toISOString()
  const blobId = nanoid()
  const storagePath = `${blobId}-${sanitizePathSegment(params.name)}`
  let fileBlob = await db
    .selectFrom('FileBlob')
    .select(['id', 'contentHash', 'path', 'type', 'size', 'encrypted', 'createdAt'])
    .where('contentHash', '=', contentHash)
    .executeTakeFirst()

  if (!fileBlob) {
    await storage.writeBuffer(storagePath, Buffer.from(params.content), env.fileStorage.encryptFiles)

    await db
      .insertInto('FileBlob')
      .values({
        id: blobId,
        contentHash,
        path: storagePath,
        type: params.mimeType,
        size: params.content.byteLength,
        encrypted: env.fileStorage.encryptFiles ? 1 : 0,
        createdAt: timestamp,
      })
      .onConflict((oc) => oc.columns(['contentHash']).doNothing())
      .execute()

    fileBlob = await db
      .selectFrom('FileBlob')
      .select(['id', 'contentHash', 'path', 'type', 'size', 'encrypted', 'createdAt'])
      .where('contentHash', '=', contentHash)
      .executeTakeFirst()
  }

  if (!fileBlob) {
    throw new Error('File blob materialization failed')
  }

  const fileId = nanoid()

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('File')
      .values({
        id: fileId,
        name: params.name,
        ownerType: params.owner.ownerType,
        ownerId: params.owner.ownerId,
        path: fileBlob.path,
        type: fileBlob.type,
        size: fileBlob.size,
        uploaded: 1,
        createdAt: timestamp,
        encrypted: fileBlob.encrypted,
        contentHash,
        fileBlobId: fileBlob.id,
      })
      .execute()

  })

  const created = await getFileWithId(fileId)
  if (!created) {
    throw new Error('Materialization failed')
  }
  return created
}
