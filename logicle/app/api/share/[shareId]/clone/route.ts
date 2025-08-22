import { getConversation, getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { nanoid } from 'nanoid'
import { dtoMessageToDbMessage } from '@/models/message'
import * as dto from '@/types/dto'
import { getUserAssistants } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'

export const POST = requireSession(
  async (session: SimpleSession, _req: Request, params: { shareId: string }) => {
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

    const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
    const assistants = await getUserAssistants(
      {
        userId: session.userId,
        workspaceIds: enabledWorkspaces.map((w) => w.id),
      },
      'published'
    )
    if (!assistants.some((a) => a.id == conversation.assistantId)) {
      return ApiResponses.forbiddenAction(
        "You can't clone this chat, as you're not entitled to use its assistant"
      )
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
      messages.find((m) => m.id == conversation.lastMessageId)!
    )
    const idMap = new Map(linear.map((m) => [m.id, nanoid()]))
    const newMessages = linear
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
      conversation: (await getConversation(newConversation.id))!,
      messages: await getConversationMessages(newConversation.id),
    }
    return ApiResponses.json(conversationWithMessages)
  }
)
