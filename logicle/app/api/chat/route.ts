import { ChatAssistant } from '@/lib/chat'
import { Tiktoken, getEncoding } from 'js-tiktoken'
import { getMessages, saveMessage } from '@/models/message'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { requireSession } from '../utils/auth'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { NextResponse } from 'next/server'
import { dtoMessageToLlmMessage } from '@/lib/chat/conversion'

function auditMessage(value: schema.MessageAudit) {
  return db.insertInto('MessageAudit').values(value).execute()
}

// build a tree from the given message towards root
function pathToRoot(messages: dto.Message[], from: dto.Message): dto.Message[] {
  const msgMap = new Map<string, dto.Message>()
  messages.forEach((msg) => {
    msgMap[msg.id] = msg
  })

  const list: dto.Message[] = []
  do {
    list.push(from)
    from = msgMap[from.parent ?? 'none']
  } while (from)
  return list
}

function limitMessages(
  encoding: Tiktoken,
  prompt: string,
  MessagesNewToOlder: dto.Message[],
  tokenLimit: number
) {
  const messagesNewToOlderToSend: dto.Message[] = []

  let tokenCount = encoding.encode(prompt).length
  for (const message of MessagesNewToOlder) {
    tokenCount = tokenCount + encoding.encode(message.content as string).length
    messagesNewToOlderToSend.push(message)
    if (tokenCount > tokenLimit) {
      break
    }
  }
  return {
    tokenCount,
    messagesNewToOlderToSend,
  }
}

export const POST = requireSession(async (session, req) => {
  const userMessage = (await req.json()) as dto.Message

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
  const dbMessagesNewToOlder = pathToRoot(dbMessages, userMessage)
  const prompt = conversation.systemPrompt
  const { tokenCount, messagesNewToOlderToSend } = limitMessages(
    encoding,
    prompt,
    dbMessagesNewToOlder,
    conversation.tokenLimit
  )

  const llmMessagesToSend = await Promise.all(
    messagesNewToOlderToSend
      .filter((m) => !m.toolCallAuthRequest && !m.toolCallAuthResponse)
      .map(dtoMessageToLlmMessage)
      .toReversed()
  )

  const availableTools = await availableToolsForAssistant(conversation.assistantId)
  const availableFunctions = Object.fromEntries(
    availableTools.flatMap((tool) => Object.entries(tool.functions))
  )

  const provider = new ChatAssistant(
    {
      providerType: conversation.providerType,
      ...JSON.parse(conversation.providerConfiguration),
    },
    {
      model: conversation.model,
      assistantId: conversation.id,
      systemPrompt: conversation.systemPrompt,
      temperature: conversation.temperature,
    },
    availableFunctions,
    saveMessage
  )

  const onComplete = async (response: dto.Message) => {
    const tokenCount = encoding.encode(response.content).length
    await auditMessage({
      messageId: response.id,
      conversationId: conversation.id,
      userId: session.user.id,
      assistantId: conversation.assistantId,
      type: 'assistant',
      model: conversation.model,
      tokens: tokenCount,
      sentAt: userMessage.sentAt,
      errors: null,
    })
  }

  const onChatTitleChange = async (title: string) => {
    await db
      .updateTable('Conversation')
      .set({
        name: title,
      })
      .where('Conversation.id', '=', conversation.id)
      .execute()
  }

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

  if (userMessage.toolCallAuthResponse) {
    const parentMessage = dbMessages.find((m) => m.id == userMessage.parent)!
    const llmResponseStream: ReadableStream<string> = await provider.sendToolCallAuthResponse(
      llmMessagesToSend,
      dbMessagesNewToOlder.toReversed(),
      userMessage,
      parentMessage.toolCallAuthRequest!
    )
    return new NextResponse(llmResponseStream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  } else {
    const llmResponseStream: ReadableStream<string> =
      await provider.sendUserMessageAndStreamResponse({
        llmMessages: llmMessagesToSend,
        dbMessages: dbMessagesNewToOlder.toReversed(),
        conversationId: userMessage.conversationId,
        parentMsgId: userMessage.id,
        onChatTitleChange,
        onComplete,
      })

    return new NextResponse(llmResponseStream, {
      headers: {
        'Content-Encoding': 'none',
        'Content-Type': 'text/event-stream',
      },
    })
  }
})
