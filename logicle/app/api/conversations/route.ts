import { createConversation, getConversationsWithFolder } from '@/models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { NextRequest } from 'next/server'
import { requireSession } from '../utils/auth'

export const dynamic = 'force-dynamic'

// Fetch all conversations
export const GET = requireSession(async (session) => {
  const conversations = await getConversationsWithFolder(session.userId)
  return ApiResponses.json(conversations)
})

// Create a new conversation
export const POST = requireSession(async (session, req: NextRequest) => {
  const body = (await req.json()) as dto.InsertableConversation
  if (body.ownerId != session.userId) {
    return ApiResponses.forbiddenAction("Can't create a conversation on behalf of another user")
  }
  const createdConversation = await createConversation(body)
  if (!createdConversation) {
    return ApiResponses.internalServerError('Conversation not created correctly')
  }
  return ApiResponses.created(createdConversation)
})
