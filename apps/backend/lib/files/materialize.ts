import { db } from '@/db/database'
import type * as schema from '@/db/schema'
import env from '@/lib/env'
import { storage } from '@/lib/storage'
import { nanoid } from 'nanoid'
import { createHash } from 'node:crypto'

export interface FileOwnerRef {
  ownerType: schema.FileOwnerType
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

const getFileWithId = async (id: string): Promise<schema.File | undefined> => {
  return await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
}

const upsertOwnership = async (
  fileId: string,
  owner: FileOwnerRef,
  timestamp: string
): Promise<void> => {
  await db
    .insertInto('FileOwnership')
    .values({
      id: nanoid(),
      fileId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      createdAt: timestamp,
    })
    .onConflict((oc) => oc.columns(['fileId', 'ownerType', 'ownerId']).doNothing())
    .execute()
}

/**
 * Persist file content and logical ownership with deduplication.
 * The same bytes map to one File row (by contentHash), while ownership rows may differ.
 */
export const materializeFile = async (params: MaterializeFileParams): Promise<schema.File> => {
  const contentHash = hashContent(params.content)
  const existing = await db
    .selectFrom('File')
    .selectAll()
    .where('contentHash', '=', contentHash)
    .where('uploaded', '=', 1)
    .executeTakeFirst()

  const timestamp = new Date().toISOString()
  if (existing) {
    await upsertOwnership(existing.id, params.owner, timestamp)
    return existing
  }

  const fileId = nanoid()
  const storagePath = `${fileId}-${sanitizePathSegment(params.name)}`
  await storage.writeBuffer(storagePath, Buffer.from(params.content), env.fileStorage.encryptFiles)

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('File')
      .values({
        id: fileId,
        name: params.name,
        path: storagePath,
        type: params.mimeType,
        size: params.content.byteLength,
        uploaded: 1,
        createdAt: timestamp,
        encrypted: env.fileStorage.encryptFiles ? 1 : 0,
        contentHash,
      })
      .execute()

    await trx
      .insertInto('FileOwnership')
      .values({
        id: nanoid(),
        fileId,
        ownerType: params.owner.ownerType,
        ownerId: params.owner.ownerId,
        createdAt: timestamp,
      })
      .execute()
  })

  const created = await getFileWithId(fileId)
  if (!created) {
    throw new Error('Materialization failed')
  }
  return created
}

