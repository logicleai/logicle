import { getConversationMessages } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { db } from '@/db/database'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'

export const GET = requireSession(
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
      .select([
        'AssistantVersion.imageId',
        'AssistantVersion.name as assistantName',
        'LastMessage.conversationId',
        'Conversation.assistantId',
        'lastMessageId',
      ])
      .executeTakeFirstOrThrow()
    const messages = await getConversationMessages(conversation.conversationId)
    const linear = extractLinearConversation(
      messages,
      messages.find((m) => m.id == conversation.lastMessageId)!
    )
    return ApiResponses.json({
      assistant: {
        id: conversation.assistantId,
        iconUri: conversation.imageId ? `/api/images/${conversation.imageId}` : null,
        name: conversation.assistantName,
      },
      messages: linear,
    })
  }
)
