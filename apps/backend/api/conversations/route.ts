import {
  createConversation,
  decodeConversationCursor,
  getConversationsPage,
} from '@/models/conversation'
import * as dto from '@/types/dto'
import env from '@/lib/env'
import { canUserAccessAssistant, updateAssistantUserData } from '@/models/assistant'
import { error, forbidden, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const conversationPageQuerySchema = z.object({
  cursor: z.string().optional(),
})

const DEFAULT_CONVERSATION_PAGE_SIZE = 50
const MAX_CONVERSATION_PAGE_SIZE = 100

export const GET = operation({
  name: 'List conversations',
  description: 'Fetch a page of conversations for the session user.',
  authentication: 'user',
  querySchema: conversationPageQuerySchema,
  responses: [responseSpec(200, dto.conversationPageSchema), errorSpec(400)] as const,
  implementation: async ({ session, query }) => {
    if (query.cursor && !decodeConversationCursor(query.cursor)) {
      return error(400, 'Invalid conversation cursor')
    }
    const configuredPageSize = env.conversationLimit ?? DEFAULT_CONVERSATION_PAGE_SIZE
    const pageSize = Math.min(Math.max(configuredPageSize, 1), MAX_CONVERSATION_PAGE_SIZE)
    return ok(
      await getConversationsPage({
        ownerId: session.userId,
        cursor: query.cursor,
        limit: pageSize,
      })
    )
  },
})

export const POST = operation({
  name: 'Create conversation',
  description: 'Create a new conversation for the session user.',
  authentication: 'user',
  requestBodySchema: dto.insertableConversationSchema,
  responses: [responseSpec(201, dto.ConversationWithFolderIdSchema), errorSpec(403)] as const,
  implementation: async ({ session, body }) => {
    if (!(await canUserAccessAssistant(session.userId, body.assistantId))) {
      return forbidden()
    }
    const createdConversation = await createConversation(session.userId, body)
    await updateAssistantUserData(createdConversation.assistantId, session.userId, {
      lastUsed: new Date().toISOString(),
    })
    return ok({ ...createdConversation, folderId: null }, 201)
  },
})
