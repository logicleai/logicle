import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'
import { isFileEncrypted, type StoredFileEncryption } from '@/lib/storage/encryption'

export interface FileDbRow {
  id: string
  name: string
  origin: 'uploaded' | 'generated' | null
  ownerType: 'USER' | 'CHAT' | 'ASSISTANT' | 'TOOL'
  ownerId: string
  path: string
  type: string
  createdAt: string
  fileBlobId?: string | null
  size?: number
  encryption: StoredFileEncryption | null
}

export const getFileWithId = async (id: string): Promise<FileDbRow | undefined> => {
  const row = await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return undefined
  if (!row.fileBlobId) return { ...row, size: undefined, encryption: null }
  const blob = await db
    .selectFrom('FileBlob')
    .select(['size', 'encryption'])
    .where('id', '=', row.fileBlobId)
    .executeTakeFirst()
  return { ...row, size: blob?.size, encryption: blob?.encryption ?? null }
}

export const addFile = async (
  file: Omit<dto.InsertableFile, 'owner'>,
  path: string,
  _encrypted: StoredFileEncryption | null,
  owner: dto.FileOwner
): Promise<FileDbRow> => {
  const id = nanoid()
  await db
    .insertInto('File')
    .values({
      id,
      name: file.name,
      path,
      type: file.type,
      origin: 'uploaded',
      size: file.size,
      uploaded: 0,
      createdAt: new Date().toISOString(),
      encrypted: isFileEncrypted(_encrypted) ? 1 : 0,
      fileBlobId: null,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
    } as any)
    .execute()
  const created = await getFileWithId(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const reassignUserOwnedFilesToConversation = async ({
  fileIds,
  userId,
  conversationId,
}: {
  fileIds: string[]
  userId: string
  conversationId: string
}) => {
  if (fileIds.length === 0) {
    return
  }

  const uniqueIds = [...new Set(fileIds)]
  await db
    .updateTable('File')
    .set({
      ownerType: 'CHAT',
      ownerId: conversationId,
    })
    .where('id', 'in', uniqueIds)
    .where('ownerType', '=', 'USER')
    .where('ownerId', '=', userId)
    .execute()
}

export const cloneFilesForOwner = async ({
  fileIds,
  owner,
}: {
  fileIds: string[]
  owner: dto.FileOwner
}): Promise<Map<string, string>> => {
  const uniqueIds = [...new Set(fileIds)]
  if (uniqueIds.length === 0) {
    return new Map()
  }

  const sourceRows = await db
    .selectFrom('File')
    .leftJoin('FileBlob', 'FileBlob.id', 'File.fileBlobId')
    .select([
      'File.id as id',
      'File.name as name',
      'File.origin as origin',
      'File.path as path',
      'File.type as type',
      'File.createdAt as createdAt',
      'File.fileBlobId as fileBlobId',
      'FileBlob.size as blobSize',
      'FileBlob.encryption as blobEncryption',
    ])
    .where('File.id', 'in', uniqueIds)
    .execute()

  const sourceById = new Map(sourceRows.map((row) => [row.id, row]))
  const now = new Date().toISOString()
  const idMap = new Map<string, string>()

  for (const sourceId of uniqueIds) {
    const source = sourceById.get(sourceId)
    if (!source) continue
    const clonedId = nanoid()
    idMap.set(sourceId, clonedId)
    await db
      .insertInto('File')
      .values({
        id: clonedId,
        name: source.name,
        path: source.path,
        type: source.type,
        origin: source.origin,
        uploaded: source.fileBlobId ? 1 : 0,
        createdAt: now,
        encrypted: isFileEncrypted(source.blobEncryption) ? 1 : 0,
        size: source.blobSize ?? 0,
        fileBlobId: source.fileBlobId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
      } as any)
      .execute()
  }

  return idMap
}
