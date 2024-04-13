import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createFolder = async (folder: dto.InsertableConversationFolder) => {
  const id = nanoid()
  db.insertInto('ConversationFolder')
    .values({
      ...folder,
      id,
    })
    .executeTakeFirst()
  const created = await getFolder(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateFolder = async (
  folderId: dto.ConversationFolder['id'],
  folder: Partial<dto.ConversationFolder>
) => {
  db.updateTable('ConversationFolder').set(folder).where('id', '=', folderId).executeTakeFirst()
}

export const getFolder = async (folderId: dto.ConversationFolder['id']) => {
  return db
    .selectFrom('ConversationFolder')
    .selectAll()
    .where('id', '=', folderId)
    .executeTakeFirst()
}

export const getFolders = async (ownerId: string) => {
  return db.selectFrom('ConversationFolder').selectAll().where('ownerId', '=', ownerId).execute()
}

export const deleteFolder = async (folderId: dto.ConversationFolder['id'], ownerId: string) => {
  return db.deleteFrom('ConversationFolder').where('id', '=', folderId).execute()
}
