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
  const row = await db
    .selectFrom('Conversation')
    .innerJoin('Assistant', (join) => join.onRef('Assistant.id', '=', 'Conversation.assistantId'))
    .innerJoin('Backend', (join) => join.onRef('Backend.id', '=', 'Assistant.backendId'))
    .selectAll('Conversation')
    .select([
      'Assistant.systemPrompt as assistantSystemPrompt',
      'Assistant.tokenLimit as assistantTokenLimit',
      'Assistant.model as assistantModel',
      'Assistant.temperature as assistantTemperature',
      'Assistant.reasoning_effort as assistantReasoningEffort',
      'Assistant.deleted as assistantDeleted',
      'Backend.provisioned as backendProvisioned',
      'Backend.providerType as backendProviderType',
      'Backend.configuration as backendConfiguration',
    ])
    .where('Conversation.id', '=', conversationId)
    .executeTakeFirst()
  if (!row) {
    return undefined
  }
  const {
    assistantSystemPrompt,
    assistantTokenLimit,
    assistantModel,
    assistantTemperature,
    assistantReasoningEffort,
    assistantDeleted,
    backendProvisioned,
    backendProviderType,
    backendConfiguration,
    ...rest
  } = row

  return {
    conversation: rest,
    assistant: {
      assistantId: rest.assistantId,
      systemPrompt: assistantSystemPrompt,
      tokenLimit: assistantTokenLimit,
      model: assistantModel,
      temperature: assistantTemperature,
      reasoning_effort: assistantReasoningEffort,
      deleted: assistantDeleted,
    },
    backend: {
      providerType: backendProviderType,
      configuration: backendConfiguration,
      provisioned: backendProvisioned,
    },
  }
}

export const getLastSentMessage = async (conversationId: dto.Conversation['id']) => {
  return await db
    .selectFrom('Message')
    .selectAll()
    .orderBy('sentAt', 'desc')
    .where('conversationId', '=', conversationId)
    .limit(1)
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

export const getConversationsWithFolder = async (ownerId: string, limit?: number) => {
  let query = db
    .selectFrom('Conversation')
    .leftJoin('ConversationFolderMembership', (join) =>
      join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
    )
    .selectAll('Conversation')
    .select('ConversationFolderMembership.folderId' as 'folderId')
    .where('Conversation.ownerId', '=', ownerId)
    .orderBy('lastMsgSentAt')
  if (limit) {
    query = query.limit(limit)
  }
  return await query.execute()
}

export const deleteConversation = async (id: string) => {
  return await db.deleteFrom('Conversation').where('id', '=', id).execute()
}
