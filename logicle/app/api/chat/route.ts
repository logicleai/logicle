import { LLMStream } from '@/lib/openai'
import { Message } from '@/types/dto'
import { getEncoding } from 'js-tiktoken'
import { getMessages, saveMessage } from 'models/message'
import { OpenAIMessage } from '@/types/openai'
import Assistants from 'models/assistant'
import { getConversationWithBackendAssistant } from 'models/conversation'
import { getBackend } from 'models/backend'
import { MessageDTO, Role } from '@/types/chat'
//import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
//import { authOptions } from '../auth/[...nextauth]/authOptions'
import ApiErrors from 'app/api/utils/ApiErrors'
import { requireSession } from '../utils/auth'
import { nanoid } from 'nanoid'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import { ChatCompletionCreateParamsBase } from '@logicleai/llmosaic/dist/types'
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

const createResponse = (userMessage: Message, stream: ReadableStream<string>) => {
  // this is what we will write to db and send to the client
  const assistantMessage: Message = {
    id: nanoid(),
    role: 'assistant',
    content: '',
    conversationId: userMessage.conversationId,
    parent: userMessage.id,
    sentAt: new Date().toISOString(),
  }
  const responseStream = new ReadableStream<string>({
    async start(controller) {
      let downStreamError = false
      try {
        const reader = stream.getReader()
        const msg = {
          type: 'response',
          content: assistantMessage,
        }
        controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
        for (;;) {
          const result = await reader.read()
          if (result.done) {
            break
          }
          const msg = {
            type: 'delta',
            content: result.value,
          }
          try {
            controller.enqueue(`data: ${JSON.stringify(msg)} \n\n`)
          } catch (e) {
            console.log(`Exception while sending chat message: ${e}`)
            downStreamError = true
            break
          }
          // Append the message after sending it to the client.
          // While it is not possible to keep what we store in db consistent
          // with what the client sees... it is fairly reasonable to assume
          // that if we fail to send it, the user has not seen it (But I'm not
          // sure that this is obvious)
          assistantMessage.content = assistantMessage.content + result.value
        }
      } catch (e) {
        console.log(`Exception while reading chat message: ${e}`)
      }
      // close the stream only if no enqueue() call has failed
      if (!downStreamError) {
        try {
          controller.close()
        } catch (e) {
          console.log(`Failed closing controller: ${e}`)
        }
      }
      await saveMessage(assistantMessage as MessageDTO)
    },
  })

  return new NextResponse(responseStream, {
    headers: {
      'Content-Encoding': 'none',
      'Content-Type': 'text/event-stream',
    },
  })
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
  const stream: ReadableStream<string> = await LLMStream(
    conversation.providerType,
    conversation.endPoint,
    conversation.model,
    conversation.apiKey,
    conversation.assistantId,
    promptToSend,
    conversation.temperature,
    messagesToSend as ChatCompletionCreateParamsBase['messages'],
    messageDtos.toReversed(),
    availableFunctions
  )
  await saveMessage(userMessage)

  return createResponse(userMessage, stream)
})
