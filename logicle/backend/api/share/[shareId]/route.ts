import { db } from '@/db/database'
import { ok, operation, responseSpec, route } from '@/lib/routes'
import { getConversationMessages } from '@/models/conversation'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { sharedConversationSchema } from '@/types/dto'
import { listUserSecretStatuses } from '@/models/userSecrets'
import { isUserProvidedApiKey, USER_SECRET_TYPE } from '@/lib/userSecrets/constants'

export const { GET } = route({
  GET: operation({
    name: 'Get shared conversation',
    description: 'Fetch a shared conversation preview.',
    authentication: 'user',
    responses: [responseSpec(200, sharedConversationSchema)] as const,
    implementation: async (_req: Request, params: { shareId: string }, { session }) => {
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
        .innerJoin('Backend', (join) =>
          join.onRef('Backend.id', '=', 'AssistantVersion.backendId')
        )
        .where('ConversationSharing.id', '=', params.shareId)
        .select([
          'AssistantVersion.imageId',
          'AssistantVersion.name as assistantName',
          'AssistantVersion.backendId as backendId',
          'Backend.name as backendName',
          'Backend.configuration as backendConfiguration',
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
      let usability:
        | { state: 'usable' }
        | { state: 'need-api-key'; backendId: string; backendName: string }
        | { state: 'not-usable'; constraint: string } = { state: 'usable' }
      try {
        const config = JSON.parse(conversation.backendConfiguration ?? '{}') as Record<
          string,
          unknown
        >
        const requiresUserKey = isUserProvidedApiKey(config.apiKey as string | undefined)
        if (requiresUserKey) {
          const secretStatuses = await listUserSecretStatuses(session.userId, USER_SECRET_TYPE)
          const hasReadableKey = secretStatuses.some(
            (status) => status.context === conversation.backendId && status.readable
          )
          if (!hasReadableKey) {
            usability = {
              state: 'need-api-key' as const,
              backendId: conversation.backendId,
              backendName: conversation.backendName ?? conversation.backendId,
            }
          }
        }
      } catch {
        usability = { state: 'usable' as const }
      }
      return ok({
        title: conversation.title,
        assistant: {
          id: conversation.assistantId,
          iconUri: conversation.imageId ? `/api/images/${conversation.imageId}` : null,
          name: conversation.assistantName,
        },
        assistantUsability: {
          ...usability,
        },
        messages: linear,
      })
    },
  }),
})
