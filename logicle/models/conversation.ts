import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { dtoMessageFromDbMessage } from './utils'

export const createConversation = async (conversation: dto.InsertableConversation) => {
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
  conversation: Partial<dto.Conversation>
): Promise<boolean> => {
  const result = await db
    .updateTable('Conversation')
    .set({ ...conversation })
    .where('id', '=', conversationId)
    .executeTakeFirst()
  return Number(result.numChangedRows) == 1
}

export const getConversation = async (conversationId: dto.Conversation['id']) => {
  return await db
    .selectFrom('Conversation')
    .selectAll()
    .where('id', '=', conversationId)
    .executeTakeFirst()
}

export const getConversationWithBackendAssistant = async (
  conversationId: dto.Conversation['id']
) => {
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
      'Backend.providerType',
      'Backend.configuration as providerConfiguration',
      'Backend.provisioned as providerProvisioned',
    ])
    .where('Conversation.id', '=', conversationId)
    .executeTakeFirst()
}

export const getConversationMessages = async (conversationId: dto.Conversation['id']) => {
  const msgs = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', conversationId)
    .execute()
  return msgs.map(dtoMessageFromDbMessage)
}

export const getConversations = async (ownerId: string) => {
  return await db
    .selectFrom('Conversation')
    .selectAll()
    .where('ownerId', '=', ownerId)
    .orderBy('Conversation.createdAt desc')
    .execute()
}

export const getConversationsWithFolder = async (ownerId: string) => {
  return await db
    .selectFrom('Conversation')
    .leftJoin('ConversationFolderMembership', (join) =>
      join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
    )
    .selectAll('Conversation')
    .select('ConversationFolderMembership.folderId' as 'folderId')
    .where('Conversation.ownerId', '=', ownerId)
    .orderBy('lastMsgSentAt')
    .execute()
}

export const deleteConversation = async (id: string) => {
  return await db.deleteFrom('Conversation').where('id', '=', id).execute()
}
