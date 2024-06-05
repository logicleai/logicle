import { LLMStream } from '@/lib/openai'
import { Tiktoken, getEncoding } from 'js-tiktoken'
import { getMessages, saveMessage } from '@/models/message'
import { Message } from '@logicleai/llmosaic/dist/types'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { requireSession } from '../utils/auth'

import { auditMessage, createResponse } from './utils'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'

//import { auth } from 'auth'

// build a tree from the given message towards root
function pathToRoot(messages: dto.MessageDTO[], from: dto.MessageDTO): dto.MessageDTO[] {
  const msgMap = new Map<string, dto.MessageDTO>()
  messages.forEach((msg) => {
    msgMap[msg.id] = msg
  })

  const list: dto.MessageDTO[] = []
  do {
    list.push(from)
    from = msgMap[from.parent ?? 'none']
  } while (from)
  return list
}

function limitMessages(
  encoding: Tiktoken,
  prompt: string,
  messageDtosNewToOlder: dto.MessageDTO[],
  tokenLimit: number
) {
  const messageDtosNewToOlderToSend: dto.MessageDTO[] = []

  let tokenCount = encoding.encode(prompt).length
  for (const message of messageDtosNewToOlder) {
    tokenCount = tokenCount + encoding.encode(message.content as string).length
    messageDtosNewToOlderToSend.push(message)
    if (tokenCount > tokenLimit) {
      break
    }
  }
  return {
    tokenCount,
    messageDtosNewToOlderToSend,
  }
}

export const POST = requireSession(async (session, req) => {
  const userMessage = (await req.json()) as dto.MessageDTO

  const conversation = await getConversationWithBackendAssistant(userMessage.conversationId)
  if (!conversation) {
    return ApiResponses.invalidParameter(
      `Trying to add a message to a non existing conversation with id ${userMessage.conversationId}`
    )
  }
  if (conversation.ownerId !== session.user.id) {
    return ApiResponses.forbiddenAction('Trying to add a message to a non owned conversation')
  }

  const encoding = getEncoding('cl100k_base')
  const dbMessages = await getMessages(userMessage.conversationId)
  const messageDtosNewToOlder = pathToRoot(dbMessages, userMessage)
  const prompt = conversation.systemPrompt!
  const { tokenCount, messageDtosNewToOlderToSend } = limitMessages(
    encoding,
    prompt,
    messageDtosNewToOlder,
    conversation.tokenLimit
  )
  const messagesToSend = messageDtosNewToOlderToSend.map((m) => {
    return {
      role: m.role as dto.Role,
      content: m.content,
    } as Message
  })

  const availableFunctions = (await availableToolsForAssistant(conversation.assistantId)).flatMap(
    (p) => p.functions
  )
  const stream: ReadableStream<string> = await LLMStream(
    conversation.providerType,
    conversation.endPoint,
    conversation.model,
    conversation.apiKey,
    conversation.assistantId,
    prompt,
    conversation.temperature,
    messagesToSend.toReversed(),
    messageDtosNewToOlder.toReversed(),
    availableFunctions,
    session.user.id
  )
  await saveMessage(userMessage)
  await auditMessage({
    messageId: userMessage.id,
    conversationId: conversation.id,
    userId: session.user.id,
    assistantId: conversation.assistantId,
    type: 'user',
    model: conversation.model,
    tokens: tokenCount,
    sentAt: userMessage.sentAt,
    errors: null,
  })

  return createResponse(userMessage, stream, async (response: dto.MessageDTO) => {
    const tokenCount = encoding.encode(response.content).length
    await saveMessage(response)
    await auditMessage({
      messageId: userMessage.id,
      conversationId: conversation.id,
      userId: session.user.id,
      assistantId: conversation.assistantId,
      type: 'assistant',
      model: conversation.model,
      tokens: tokenCount,
      sentAt: userMessage.sentAt,
      errors: null,
    })
  })
})
