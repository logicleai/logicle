import { getConversationWithBackendAssistant } from '@/models/conversation'
import { SimpleSession } from '@/types/session'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { logger } from '@/lib/logging'
import { Usage } from '@/lib/chat'
import { db } from 'db/database'

function doAuditMessage(value: schema.MessageAudit) {
  return db.insertInto('MessageAudit').values(value).execute()
}

export class MessageAuditor {
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
      auditEntry.tokens = usage.totalTokens
      if (this.pendingLlmInvocation) {
        this.pendingLlmInvocation.tokens = usage.inputTokens
        await doAuditMessage(this.pendingLlmInvocation)
        this.pendingLlmInvocation = undefined
      } else {
        logger.error('Expected a pending message')
      }
    }
    if (auditEntry.type === 'user' || auditEntry.type === 'tool') {
      this.pendingLlmInvocation = auditEntry
    } else {
      await doAuditMessage(auditEntry)
    }
  }

  convertToAuditMessage(message: dto.Message): schema.MessageAudit | undefined {
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
