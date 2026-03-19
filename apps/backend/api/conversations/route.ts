import { createConversation, getConversationsWithFolder } from '@/models/conversation'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import { updateAssistantUserData } from '@/models/assistant'
import { ok, operation, responseSpec } from '@/lib/routes'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List conversations',
  description: 'Fetch all conversations for the session user.',
  authentication: 'user',
  responses: [responseSpec(200, dto.ConversationWithFolderSchema.array())] as const,
  implementation: async ({ session }) => {
    return ok(
      await getConversationsWithFolder({
        ownerId: session.userId,
        limit: env.conversationLimit,
      })
    )
  },
})

export const POST = operation({
  name: 'Create conversation',
  description: 'Create a new conversation for the session user.',
  authentication: 'user',
  requestBodySchema: dto.insertableConversationSchema,
  responses: [responseSpec(201, dto.ConversationWithFolderIdSchema)] as const,
  implementation: async ({ session, body }) => {
    const createdConversation = await createConversation(session.userId, body)
    await updateAssistantUserData(createdConversation.assistantId, session.userId, {
      lastUsed: new Date().toISOString(),
    })
    return ok({ ...createdConversation, folderId: null }, 201)
  },
})
