import { createConversation, getConversationsWithFolder } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { NextRequest } from 'next/server'
import { requireSession } from '../utils/auth'
import env from '@/lib/env'
import { updateAssistantUserData } from '@/models/assistant'

export const dynamic = 'force-dynamic'

// Fetch all conversations
export const GET = requireSession(async (session) => {
  const conversations = await getConversationsWithFolder({
    ownerId: session.userId,
    limit: env.conversationLimit,
  })
  return ApiResponses.json(conversations)
})

// Create a new conversation
export const POST = requireSession(async (session, req: NextRequest) => {
  const body = (await req.json()) as dto.InsertableConversation
  if (body.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction("Can't create a conversation on behalf of another user")
  }
  const createdConversation = await createConversation(body)
  await updateAssistantUserData(createdConversation.assistantId, session.userId, {
    lastUsed: new Date().toISOString(),
  })
  return ApiResponses.created(createdConversation)
})
