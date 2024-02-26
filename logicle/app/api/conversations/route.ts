import { createConversation, getConversationsWithFolder } from 'models/conversation'
import ApiResponses from '@/api/utils/ApiResponses'
import { InsertableConversation } from '@/types/dto'
import { NextRequest } from 'next/server'
import { requireSession } from '../utils/auth'

export const dynamic = 'force-dynamic'

// Fetch all conversations
export const GET = requireSession(async (session) => {
  const conversations = await getConversationsWithFolder(session!.user.id)
  return ApiResponses.json(conversations)
})

// Create a new conversation
export const POST = requireSession(async (session, req: NextRequest) => {
  const body = (await req.json()) as InsertableConversation
  if (body.ownerId != session?.user.id) {
    return ApiResponses.forbiddenAction("Can't create a conversation on behalf of another user")
  }
  const createdConversation = await createConversation(body)
  if (!createdConversation) {
    return ApiResponses.internalServerError('Conversation not created correctly')
  }
  return ApiResponses.created(createdConversation)
})
