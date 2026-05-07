import { db } from '@/db/database'
import { forbidden, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getConversation, getConversationMessages } from '@/models/conversation'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { nanoid } from 'nanoid'
import { dtoMessageToDbMessage } from '@/models/message'
import * as dto from '@/types/dto'
import { getUserAssistants } from '@/models/assistant'
import { cloneFilesForOwner } from '@/models/file'

const collectFileIdsFromMessage = (message: dto.Message): string[] => {
  const ids: string[] = []
  if (message.role === 'user') {
    ids.push(...message.attachments.map((attachment) => attachment.id))
    return ids
  }

  if (message.role === 'tool') {
    for (const part of message.parts) {
      if (part.type !== 'tool-result') continue
      if (part.result.type !== 'content') continue
      for (const contentPart of part.result.value) {
        if (contentPart.type === 'file') {
          ids.push(contentPart.id)
        }
      }
    }
  }

  return ids
}

const remapMessageFileIds = (message: dto.Message, fileIdMap: Map<string, string>): dto.Message => {
  if (message.role === 'user') {
    return {
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        id: fileIdMap.get(attachment.id) ?? attachment.id,
      })),
    }
  }

  if (message.role === 'tool') {
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== 'tool-result') return part
        if (part.result.type !== 'content') return part
        return {
          ...part,
          result: {
            ...part.result,
            value: part.result.value.map((contentPart) =>
              contentPart.type === 'file'
                ? { ...contentPart, id: fileIdMap.get(contentPart.id) ?? contentPart.id }
                : contentPart
            ),
          },
        }
      }),
    }
  }

  return message
}

export const POST = operation({
  name: 'Clone shared conversation',
  description: 'Clone a shared conversation into the current user account.',
  authentication: 'user',
  responses: [responseSpec(200), errorSpec(403)] as const,
  implementation: async ({ params, session }) => {
    const conversation = await db
      .selectFrom('ConversationSharing')
      .innerJoin('Message', (join) =>
        join.onRef('Message.id', '=', 'ConversationSharing.lastMessageId')
      )
      .innerJoin('Conversation', (join) =>
        join.onRef('Conversation.id', '=', 'Message.conversationId')
      )
      .innerJoin('Assistant', (join) => join.onRef('Assistant.id', '=', 'Conversation.assistantId'))
      .innerJoin('AssistantVersion', (join) =>
        join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
      )
      .where('ConversationSharing.id', '=', params.shareId)
      .select([
        'Conversation.name',
        'AssistantVersion.assistantId',
        'Message.conversationId',
        'ConversationSharing.lastMessageId',
      ])
      .executeTakeFirstOrThrow()
    const id = nanoid()

    const assistants = await getUserAssistants(
      {
        userId: session.userId,
      },
      'published'
    )
    if (!assistants.some((a) => a.id === conversation.assistantId)) {
      return forbidden("You can't clone this chat, as you're not entitled to use its assistant")
    }
    const newConversation = {
      id,
      assistantId: conversation.assistantId,
      name: conversation.name,
      ownerId: session.userId,
      createdAt: new Date().toISOString(),
    }

    const messages = await getConversationMessages(conversation.conversationId)
    const linear = extractLinearConversation(
      messages,
      messages.find((m) => m.id === conversation.lastMessageId)!
    )
    const clonedFileIds = await cloneFilesForOwner({
      fileIds: linear.flatMap((message) => collectFileIdsFromMessage(message)),
      owner: { ownerType: 'CHAT', ownerId: newConversation.id },
    })
    const linearWithClonedFiles = linear.map((message) => remapMessageFileIds(message, clonedFileIds))
    const idMap = new Map(linear.map((m) => [m.id, nanoid()]))
    const newMessages = linearWithClonedFiles
      .map((m) => {
        return {
          ...m,
          id: idMap.get(m.id)!,
          conversationId: newConversation.id,
          parent: m.parent == null ? null : idMap.get(m.parent)!,
        }
      })
      .map(dtoMessageToDbMessage)
    await db.insertInto('Conversation').values(newConversation).execute()
    await db.insertInto('Message').values(newMessages).execute()
    const conversationWithMessages: dto.ConversationWithMessages = {
      conversation: {
        ...(await getConversation(newConversation.id))!,
        folderId: null,
      },
      messages: await getConversationMessages(newConversation.id),
    }
    return ok(conversationWithMessages)
  },
})
