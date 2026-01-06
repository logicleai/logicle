import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { getConversationMessages } from '@/models/conversation'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { sharedConversationSchema } from '@/types/dto'

export const { GET } = route({
  GET: operation({
    name: 'Get shared conversation',
    description: 'Fetch a shared conversation preview.',
    authentication: 'user',
    responseBodySchema: sharedConversationSchema,
    implementation: async (_req: Request, params: { shareId: string }) => {
      const conversation = await db
        .selectFrom('ConversationSharing')
        .innerJoin('Message as LastMessage', (join) =>
          join.onRef('LastMessage.id', '=', 'ConversationSharing.lastMessageId')
        )
        .innerJoin('Conversation', (join) =>
          join.onRef('Conversation.id', '=', 'LastMessage.conversationId')
        )
        .innerJoin('Assistant', (join) =>
          join.onRef('Assistant.id', '=', 'Conversation.assistantId')
        )
        .innerJoin('AssistantVersion', (join) =>
          join.onRef('AssistantVersion.id', '=', 'Assistant.publishedVersionId')
        )
        .where('ConversationSharing.id', '=', params.shareId)
        .select([
          'AssistantVersion.imageId',
          'AssistantVersion.name as assistantName',
          'LastMessage.conversationId',
          'Conversation.assistantId',
          'Conversation.name as title',
          'lastMessageId',
        ])
        .executeTakeFirstOrThrow()
      const messages = await getConversationMessages(conversation.conversationId)
      const linear = extractLinearConversation(
        messages,
        messages.find((m) => m.id === conversation.lastMessageId)!
      )
      return {
        title: conversation.title,
        assistant: {
          id: conversation.assistantId,
          iconUri: conversation.imageId ? `/api/images/${conversation.imageId}` : null,
          name: conversation.assistantName,
        },
        messages: linear,
      }
    },
  }),
})
