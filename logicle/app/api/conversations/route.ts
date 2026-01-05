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
  const result = dto.insertableConversationSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const body = result.data
  const createdConversation = await createConversation(session.userId, body)
  await updateAssistantUserData(createdConversation.assistantId, session.userId, {
    lastUsed: new Date().toISOString(),
  })
  return ApiResponses.created(createdConversation)
})
