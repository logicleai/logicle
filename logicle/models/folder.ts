import { ConversationFolder, InsertableConversationFolder } from '@/types/db'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createFolder = async (folder: InsertableConversationFolder) => {
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
  folderId: ConversationFolder['id'],
  folder: Partial<ConversationFolder>
) => {
  db.updateTable('ConversationFolder').set(folder).where('id', '=', folderId).executeTakeFirst()
}

export const getFolder = async (folderId: ConversationFolder['id']) => {
  return db
    .selectFrom('ConversationFolder')
    .selectAll()
    .where('id', '=', folderId)
    .executeTakeFirst()
}

export const getFolders = async (ownerId: string) => {
  return db.selectFrom('ConversationFolder').selectAll().where('ownerId', '=', ownerId).execute()
}

export const deleteFolder = async (folderId: ConversationFolder['id'], ownerId: string) => {
  return db.deleteFrom('ConversationFolder').where('id', '=', folderId).execute()
}
