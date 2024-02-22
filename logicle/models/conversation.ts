import { db } from 'db/database'
import { Conversation, InsertableConversation } from '@/types/db'
import { nanoid } from 'nanoid'
import { messageDtoFromMessage } from './utils'

export const createConversation = async (conversation: InsertableConversation) => {
  const id = nanoid()
  await db
    .insertInto('Conversation')
    .values({
      ...conversation,
      createdAt: new Date().toISOString(),
      id: id,
    })
    .executeTakeFirstOrThrow()
  return getConversation(id)
}

export const updateConversation = async (
  conversationId: string,
  conversation: Partial<Conversation>
): Promise<Boolean> => {
  const result = await db
    .updateTable('Conversation')
    .set({ ...conversation })
    .where('id', '=', conversationId)
    .executeTakeFirst()
  return Number(result.numChangedRows) == 1
}

export const getConversation = async (conversationId: Conversation['id']) => {
  return await db
    .selectFrom('Conversation')
    .selectAll()
    .where('id', '=', conversationId)
    .executeTakeFirst()
}

export const getConversationWithBackendAssistant = async (conversationId: Conversation['id']) => {
  return await db
    .selectFrom('Conversation')
    .innerJoin('Assistant', (join) => join.onRef('Assistant.id', '=', 'Conversation.assistantId'))
    .innerJoin('Backend', (join) => join.onRef('Backend.id', '=', 'Assistant.backendId'))
    .selectAll('Conversation')
    .select([
      'Assistant.systemPrompt',
      'Assistant.tokenLimit',
      'Assistant.model',
      'Assistant.temperature',
      'Backend.apiKey',
      'Backend.providerType',
      'Backend.endPoint',
    ])
    .where('Conversation.id', '=', conversationId)
    .executeTakeFirst()
}

export const getConversationMessages = async (conversationId: Conversation['id']) => {
  const msgs = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .execute()
  return msgs.map(messageDtoFromMessage)
}

export const getConversations = async (ownerId: string) => {
  return await db.selectFrom('Conversation').selectAll().where('ownerId', '=', ownerId).execute()
}

export const getConversationsWithFolder = async (ownerId: string) => {
  db.selectFrom('Message').select(({ fn }) =>
    fn.max<string | null, 'sentAt'>('sentAt').as('lastMsgSentAt')
  )
  return await db
    .selectFrom('Conversation')
    .leftJoin('ConversationFolderMembership', (join) =>
      join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
    )
    .selectAll('Conversation')
    .select('ConversationFolderMembership.folderId' as 'folderId')
    .select((eb) =>
      eb
        .selectFrom('Message')
        .select('Message.sentAt')
        .whereRef('Message.conversationId', '=', 'Conversation.id')
        .orderBy('Message.sentAt', 'desc')
        .limit(1)
        .as('lastMsgSentAt')
    )
    .where('Conversation.ownerId', '=', ownerId)
    .execute()
}

export const deleteConversation = async (id: string) => {
  db.deleteFrom('Conversation').where('id', '=', id).execute()
}
