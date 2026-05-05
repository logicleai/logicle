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
  contentHash: string | null
  size: number
  encrypted: 0 | 1
  uploaded?: 0 | 1
}

export const getFileWithId = async (id: string): Promise<FileDbRow | undefined> => {
  return await db.selectFrom('File').selectAll().where('id', '=', id).executeTakeFirst()
}

export const addFile = async (
  file: dto.InsertableFile,
  path: string,
  encrypted: boolean,
  owner: dto.FileOwner
): Promise<FileDbRow> => {
  const id = nanoid()
  await db
    .insertInto('File')
    .values({
      ...file,
      id,
      path: path,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      createdAt: new Date().toISOString(),
      uploaded: 0,
      encrypted: encrypted ? 1 : 0,
      fileBlobId: null,
    })
    .execute()
  const created = await getFileWithId(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}
