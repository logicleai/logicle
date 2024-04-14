import { LLMStream } from '@/lib/openai'
//import { Message } from '@/types/dto'
import { getEncoding } from 'js-tiktoken'
import { getMessages, saveMessage } from '@/models/message'
import { Message } from '@logicleai/llmosaic/dist/types'
//import Assistants from 'models/assistant'
import { getConversationWithBackendAssistant } from '@/models/conversation'
//import { getBackend } from 'models/backend'
import { MessageDTO, Role } from '@/types/chat'
//import { getServerSession } from 'next-auth'
//import { NextRequest, NextResponse } from 'next/server'
//import { authOptions } from '../auth/[...nextauth]/authOptions'
//import ApiErrors from 'app/api/utils/ApiErrors'
import { requireSession } from '../utils/auth'
//import { nanoid } from 'nanoid'

import { createResponse } from './utils'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
//import { auth } from 'auth'

// build a tree from the given message towards root
// build a tree from the given message towards root
function pathToRoot(messages: MessageDTO[], from: MessageDTO): MessageDTO[] {
  const msgMap = new Map<string, MessageDTO>()
  messages.forEach((msg) => {
    msgMap[msg.id] = msg
  })

  const list: MessageDTO[] = []
  do {
    list.push(from)
    from = msgMap[from.parent ?? 'none']
  } while (from)
  return list
}

export const POST = requireSession(async (session, req) => {
  const userMessage = (await req.json()) as MessageDTO

  const conversation = await getConversationWithBackendAssistant(userMessage.conversationId)
  if (!conversation) {
    return ApiResponses.invalidParameter(
      `Trying to add a message to a non existing conversation with id ${userMessage.conversationId}`
    )
  }
  if (conversation.ownerId !== session.user.id) {
    return ApiResponses.forbiddenAction('Trying to add a message to a non owned conversation')
  }

  const dbMessages = await getMessages(userMessage.conversationId)
  const messageDtos = pathToRoot(dbMessages, userMessage)
  const messages = messageDtos.map((m) => {
    return {
      role: m.role as Role,
      content: m.content,
    } as Message
  })

  const encoding = getEncoding('cl100k_base')

  const promptToSend = conversation.systemPrompt!

  const prompt_tokens = encoding.encode(promptToSend)

  let tokenCount = prompt_tokens.length
  let messagesToSend: Message[] = []

  for (const message of messages) {
    const tokens = encoding.encode(message.content as string)

    tokenCount += tokens.length
    messagesToSend = [message, ...messagesToSend]

    if (tokenCount + tokens.length > conversation.tokenLimit!) {
      break
    }
  }

  const availableFunctions = (await availableToolsForAssistant(conversation.assistantId)).flatMap(
    (p) => p.functions
  )
  const stream: ReadableStream<string> = await LLMStream(
    conversation.providerType,
    conversation.endPoint,
    conversation.model,
    conversation.apiKey,
    conversation.assistantId,
    promptToSend,
    conversation.temperature,
    messagesToSend,
    messageDtos.toReversed(),
    availableFunctions
  )
  await saveMessage(userMessage)

  return createResponse(userMessage, stream)
})
