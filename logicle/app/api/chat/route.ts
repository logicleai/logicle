import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { requireSession } from '../utils/auth'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import { NextResponse } from 'next/server'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'
import { MessageAuditor } from '@/lib/MessageAuditor'
import { assistantVersionFiles } from '@/models/assistant'
import { setRootSpanAttrs } from '@/lib/tracing/root-registry'

export const POST = requireSession(async (session, req) => {
  const userMessage = (await req.json()) as dto.Message
  const acceptLanguageHeader = req.headers.get('Accept-Language')

  const conversationWithBackendAssistant = await getConversationWithBackendAssistant(
    userMessage.conversationId
  )
  if (!conversationWithBackendAssistant) {
    return ApiResponses.invalidParameter(
      `Trying to add a message to a non existing conversation with id ${userMessage.conversationId}`
    )
  }

  const { conversation, assistant, backend } = conversationWithBackendAssistant

  setRootSpanAttrs({
    'conversation.id': conversation.id,
    'assistant.id': assistant.assistantId,
    'message.id': userMessage.id,
  })

  if (conversation.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction('Trying to add a message to a non owned conversation')
  }

  if (assistant.deleted) {
    return ApiResponses.forbiddenAction('This assistant has been deleted')
  }

  const dbMessages = await getMessages(userMessage.conversationId)
  const linearThread = extractLinearConversation(dbMessages, userMessage)
  const availableTools = await availableToolsForAssistantVersion(
    assistant.assistantVersionId,
    assistant.model
  )

  const updateChatTitle = async (title: string) => {
    await db
      .updateTable('Conversation')
      .set({
        name: title,
      })
      .where('Conversation.id', '=', conversation.id)
      .execute()
  }

  const auditor = new MessageAuditor(conversationWithBackendAssistant, session)

  const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
    await saveMessage(message)
    await auditor.auditMessage(message, usage)
  }

  const files = await assistantVersionFiles(assistant.assistantVersionId)
  const provider = await ChatAssistant.build(
    {
      providerType: backend.providerType,
      provisioned: backend.provisioned,
      ...JSON.parse(backend.configuration),
    },
    assistant,
    availableTools,
    files,
    {
      saveMessage: saveAndAuditMessage,
      updateChatTitle,
      user: session.userId,
      userLanguage: acceptLanguageHeader ?? undefined,
    }
  )

  await saveAndAuditMessage(userMessage)
  const llmResponseStream: ReadableStream<string> =
    await provider.sendUserMessageAndStreamResponse(linearThread)
  return new NextResponse(llmResponseStream, {
    headers: {
      'Content-Encoding': 'none',
      'Content-Type': 'text/event-stream',
    },
  })
})
