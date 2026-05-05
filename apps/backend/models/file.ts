import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export interface FileDbRow {
  id: string
  name: string
  ownerType: 'USER' | 'CHAT' | 'ASSISTANT' | 'TOOL'
  ownerId: string
  path: string
  type: string
  createdAt: string
  fileBlobId?: string | null
  size?: number
  encrypted?: 0 | 1
}

export const getFileWithId = async (id: string): Promise<FileDbRow | undefined> => {
  const row = await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return undefined
  if (!row.fileBlobId) return { ...row, size: undefined, encrypted: undefined }
  const blob = await db
    .selectFrom('FileBlob')
    .select(['size', 'encrypted'])
    .where('id', '=', row.fileBlobId)
    .executeTakeFirst()
  return { ...row, size: blob?.size, encrypted: blob?.encrypted }
}

export const addFile = async (
  file: dto.InsertableFile,
  path: string,
  _encrypted: boolean,
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
      size: file.size,
      uploaded: 0,
      createdAt: new Date().toISOString(),
      encrypted: _encrypted ? 1 : 0,
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
