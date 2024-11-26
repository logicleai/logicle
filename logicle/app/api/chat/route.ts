import { ChatAssistant, Usage } from '@/lib/chat'
import { getMessages, saveMessage } from '@/models/message'
import { getConversationWithBackendAssistant } from '@/models/conversation'
import { requireSession, SimpleSession } from '../utils/auth'
import ApiResponses from '../utils/ApiResponses'
import { availableToolsForAssistant } from '@/lib/tools/enumerate'
import * as dto from '@/types/dto'
import { db } from 'db/database'
import * as schema from '@/db/schema'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logging'

function doAuditMessage(value: schema.MessageAudit) {
  return db.insertInto('MessageAudit').values(value).execute()
}

// extract lineat thread terminating in 'from'
function extractLinearConversation(messages: dto.Message[], from: dto.Message): dto.Message[] {
  const msgMap = new Map<string, dto.Message>()
  messages.forEach((msg) => {
    msgMap[msg.id] = msg
  })

  const list: dto.Message[] = []
  do {
    list.push(from)
    from = msgMap[from.parent ?? 'none']
  } while (from)
  return list.toReversed()
}

class MessageAuditor {
  conversation: Exclude<Awaited<ReturnType<typeof getConversationWithBackendAssistant>>, undefined>
  session: SimpleSession
  pendingLlmInvocation: schema.MessageAudit | undefined
  constructor(
    conversation: Exclude<
      Awaited<ReturnType<typeof getConversationWithBackendAssistant>>,
      undefined
    >,
    session: SimpleSession
  ) {
    this.conversation = conversation
    this.session = session
  }

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
      conversationId: this.conversation.id,
      userId: this.session.userId,
      assistantId: this.conversation.assistantId,
      type: message.role,
      model: this.conversation.model,
      tokens: 0,
      sentAt: message.sentAt,
      errors: null,
    }
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
  if (conversation.ownerId !== session.userId) {
    return ApiResponses.forbiddenAction('Trying to add a message to a non owned conversation')
  }

  const dbMessages = await getMessages(userMessage.conversationId)
  const linearThread = extractLinearConversation(dbMessages, userMessage)
  const availableTools = await availableToolsForAssistant(conversation.assistantId)
  const availableFunctions = Object.fromEntries(
    availableTools.flatMap((tool) => Object.entries(tool.functions))
  )

  const updateChatTitle = async (conversationId: string, title: string) => {
    await db
      .updateTable('Conversation')
      .set({
        name: title,
      })
      .where('Conversation.id', '=', conversation.id)
      .execute()
  }

  const auditor = new MessageAuditor(conversation, session)

  const saveAndAuditMessage = async (message: dto.Message, usage?: Usage) => {
    await saveMessage(message)
    await auditor.auditMessage(message, usage)
  }

  const provider = new ChatAssistant(
    {
      providerType: conversation.providerType,
      provisioned: conversation.providerProvisioned,
      ...JSON.parse(conversation.providerConfiguration),
    },
    {
      model: conversation.model,
      assistantId: conversation.id,
      systemPrompt: conversation.systemPrompt,
      temperature: conversation.temperature,
      tokenLimit: conversation.tokenLimit,
    },
    availableFunctions,
    {
      saveMessage: saveAndAuditMessage,
      updateChatTitle,
      user: session.userId,
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
