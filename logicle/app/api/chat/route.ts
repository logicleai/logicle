import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { requireSession, SimpleSession } from '../utils/auth'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistantVersion } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logging'
import { extractLinearConversation } from '@/lib/chat/conversationUtils'

function doAuditMessage(value: schema.MessageAudit) {
  return db.insertInto('MessageAudit').values(value).execute()
}

// extract lineat thread terminating in 'from'

class MessageAuditor {
  pendingLlmInvocation: schema.MessageAudit | undefined
  constructor(
    private conversation: Exclude<
      Awaited<ReturnType<typeof getConversationWithBackendAssistant>>,
      undefined
    >,
    private session: SimpleSession
  ) {}

  async dispose() {
    if (this.pendingLlmInvocation) {
      logger.warn(`Auditing unexpected ${this.pendingLlmInvocation.type}`)
    }
    this.pendingLlmInvocation = undefined
  }

  async auditMessage(message: dto.Message, usage?: Usage) {
    const auditEntry = this.convertToAuditMessage(message)
    if (!auditEntry) {
      return
    }
    if (usage) {
      auditEntry.tokens = usage.completionTokens
      if (this.pendingLlmInvocation) {
        this.pendingLlmInvocation.tokens = usage.promptTokens
        await doAuditMessage(this.pendingLlmInvocation)
        this.pendingLlmInvocation = undefined
      } else {
        logger.error('Expected a pending message')
      }
    }
    if (auditEntry.type == 'user' || auditEntry.type == 'tool-result') {
      this.pendingLlmInvocation = auditEntry
    } else {
      await doAuditMessage(auditEntry)
    }
  }

  convertToAuditMessage(message: dto.Message): schema.MessageAudit | undefined {
    if (message.role == 'tool-debug') return undefined
    return {
      messageId: message.id,
      conversationId: this.conversation.conversation.id,
      userId: this.session.userId,
      assistantId: this.conversation.conversation.assistantId,
      type: message.role,
      model: this.conversation.assistant.model,
      tokens: 0,
      sentAt: message.sentAt,
      errors: null,
    }
  }
}

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

  if (conversation.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction('Trying to add a message to a non owned conversation')
  }
  if (assistant.deleted) {
    return ApiResponses.forbiddenAction('This assistant has been deleted')
  }

  const dbMessages = await getMessages(userMessage.conversationId)
  const linearThread = extractLinearConversation(dbMessages, userMessage)
  const availableTools = await availableToolsForAssistantVersion(assistant.assistantVersionId)

  const updateChatTitle = async (conversationId: string, title: string) => {
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

  const provider = await ChatAssistant.build(
    {
      providerType: backend.providerType,
      provisioned: backend.provisioned,
      ...JSON.parse(backend.configuration),
    },
    assistant,
    availableTools,
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
