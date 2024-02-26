import { LLMStream } from '@/lib/openai'
import { getEncoding } from 'js-tiktoken'
import { getMessages, saveMessage } from 'models/message'
import { OpenAIMessage } from '@/types/openai'
import { getConversationWithBackendAssistant } from 'models/conversation'
import { MessageDTO, Role } from '@/types/chat'
import ApiResponses from '../utils/ApiResponses'
import { requireSession } from '../utils/auth'
import { createResponse } from './utils'
import { availableTools, availableToolsForAssistant } from '@/lib/tools/enumerate'

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
    } as OpenAIMessage
  })

  const encoding = getEncoding('cl100k_base')

  const promptToSend = conversation.systemPrompt!

  const prompt_tokens = encoding.encode(promptToSend)

  let tokenCount = prompt_tokens.length
  let messagesToSend: OpenAIMessage[] = []

  for (const message of messages) {
    const tokens = encoding.encode(message.content)

    tokenCount += tokens.length
    messagesToSend = [message, ...messagesToSend]

    if (tokenCount + tokens.length > conversation.tokenLimit!) {
      break
    }
  }

  const availableFunctions = (await availableToolsForAssistant(conversation.assistantId)).flatMap(
    (p) => p.functions
  )
  const stream: ReadableStream<string> = LLMStream(
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
