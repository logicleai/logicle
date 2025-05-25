import { getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { nanoid } from 'nanoid'
import { dtoMessageToDbMessage } from '@/models/message'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'

export const POST = requireSession(
  async (session: SimpleSession, req: Request, params: { shareId: string }) => {
    const conversation = await db
      .selectFrom('ConversationSharing')
      .innerJoin('Message as LastMessage', (join) =>
        join.onRef('LastMessage.id', '=', 'ConversationSharing.lastMessageId')
      )
      .innerJoin('Conversation', (join) =>
        join.onRef('Conversation.id', '=', 'LastMessage.conversationId')
      )
      .innerJoin('Assistant', (join) => join.onRef('Assistant.id', '=', 'Conversation.assistantId'))
      .innerJoin('AssistantVersion', (join) =>
        join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
      )
      .where('ConversationSharing.id', '=', params.shareId)
      .selectAll()
      .executeTakeFirstOrThrow()
    const id = nanoid()

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
    db.insertInto('Conversation').values(newConversation).execute()
    db.insertInto('Message').values(newMessages).execute()

    return ApiResponses.json(newConversation)
  }
)
