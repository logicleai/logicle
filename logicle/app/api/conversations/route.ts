import { createConversation, getConversationsWithFolder } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { requireSession } from '../utils/auth'
import env from '@/lib/env'
import { updateAssistantUserData } from '@/models/assistant'
import { route, operation } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const { GET, POST } = route({
  GET: operation({
    name: 'List conversations',
    description: 'Fetch all conversations for the session user.',
    authentication: 'user',
    responseBodySchema: dto.ConversationWithFolderSchema.array(),
    implementation: async (_req, _params, { session }) => {
      const conversations = await getConversationsWithFolder({
        ownerId: session.userId,
        limit: env.conversationLimit,
      })
      return conversations.map((c) => ({ ...c, folderId: (c as any).folderId ?? null }))
    },
  }),
  POST: operation({
    name: 'Create conversation',
    description: 'Create a new conversation for the session user.',
    authentication: 'user',
    requestBodySchema: dto.insertableConversationSchema,
    responseBodySchema: dto.ConversationWithFolderIdSchema,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const createdConversation = await createConversation(session.userId, requestBody)
      await updateAssistantUserData(createdConversation.assistantId, session.userId, {
        lastUsed: new Date().toISOString(),
      })
      return { ...createdConversation, folderId: (createdConversation as any).folderId ?? null }
    },
  }),
})
