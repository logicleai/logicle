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
  return Number(result.numChangedRows) === 1
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
    .innerJoin('AssistantVersion', (join) =>
      join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
    )
    .innerJoin('Backend', (join) => join.onRef('Backend.id', '=', 'AssistantVersion.backendId'))
    .selectAll('Conversation')
    .select([
      'AssistantVersion.id as assistantVersionId',
      'AssistantVersion.systemPrompt as assistantSystemPrompt',
      'AssistantVersion.tokenLimit as assistantTokenLimit',
      'AssistantVersion.model as assistantModel',
      'AssistantVersion.temperature as assistantTemperature',
      'AssistantVersion.reasoning_effort as assistantReasoningEffort',
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
    assistantVersionId,
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
      assistantVersionId: assistantVersionId,
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

export const getConversationMessage = async (messageId: string) => {
  const msg = await db
    .selectFrom('Message')
    .selectAll()
    .where('id', '=', messageId)
    .executeTakeFirst()
  return msg && dtoMessageFromDbMessage(msg)
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

export const getMostRecentConversation = async (ownerId: string) => {
  return await db
    .selectFrom('Conversation')
    .selectAll()
    .where('lastMsgSentAt', 'is not', null)
    .where('ownerId', '=', ownerId)
    .orderBy('lastMsgSentAt', 'desc')
    .limit(1)
    .select('assistantId')
    .executeTakeFirst()
}

export const getConversationsWithFolder = async ({
  ownerId,
  limit,
  folderId,
}: {
  ownerId?: string
  limit?: number
  folderId?: string
}): Promise<dto.ConversationWithFolder[]> => {
  let query = db
    .selectFrom('Conversation')
    .leftJoin('ConversationFolderMembership', (join) =>
      join.onRef('ConversationFolderMembership.conversationId', '=', 'Conversation.id')
    )
    .leftJoin('Assistant', (join) => join.onRef('Conversation.assistantId', '=', 'Assistant.id'))
    .leftJoin('AssistantVersion', (join) =>
      join.onRef('Assistant.publishedVersionId', '=', 'AssistantVersion.id')
    )
    .select('AssistantVersion.name as assistantName')
    .select('AssistantVersion.imageId as assistantImageId')
    .selectAll('Conversation')
    .select('ConversationFolderMembership.folderId' as 'folderId')
  if (ownerId) {
    query = query.where('Conversation.ownerId', '=', ownerId)
  }
  if (folderId) {
    query = query.where('ConversationFolderMembership.folderId', '=', folderId)
  }

  query = query.orderBy('lastMsgSentAt')
  if (limit) {
    query = query.limit(limit)
  }
  const result = await query.execute()
  const mapped = result.map((c) => {
    const { assistantName, assistantImageId, ...rest } = c
    return {
      ...rest,
      folderId: rest.folderId,
      assistant: {
        id: rest.assistantId,
        iconUri: assistantImageId ? `/api/images/${assistantImageId}` : null,
        name: assistantName,
      },
    }
  })
  return mapped as unknown as dto.ConversationWithFolder[]
}

export const deleteConversation = async (id: string) => {
  return await db.deleteFrom('Conversation').where('id', '=', id).execute()
}
