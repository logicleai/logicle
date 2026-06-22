import { getConversationWithBackendAssistant } from '@/models/conversation'
import { SimpleSession } from '@/types/session'
import * as dto from '@/types/dto'
import * as schema from '@/db/schema'
import { logger } from '@/lib/logging'
import type { Usage } from '@/backend/lib/chat/usage'
import { db } from 'db/database'
import env from '@/lib/env'
import { sql } from 'kysely'

function doAuditMessage(value: schema.MessageAudit) {
  return db.insertInto('MessageAudit').values(value).execute()
}

function stringifyTokenDetails(value: unknown): string | null {
  if (value == null) {
    return null
  }
  return JSON.stringify(value)
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
      if (this.pendingLlmInvocation) {
        this.pendingLlmInvocation.tokens = usage.inputTokens
        this.pendingLlmInvocation.tokenDetails = stringifyTokenDetails(usage.inputTokenDetails)
        await doAuditMessage(this.pendingLlmInvocation)
        this.pendingLlmInvocation = undefined
      } else {
        logger.error('Expected a pending message')
      }
      auditEntry.tokens = usage.outputTokens
      auditEntry.tokenDetails = stringifyTokenDetails(usage.outputTokenDetails)
      await this.updateTokenWindow(usage)
    }
    if (auditEntry.type === 'user' || auditEntry.type === 'tool') {
      this.pendingLlmInvocation = auditEntry
    } else {
      await doAuditMessage(auditEntry)
    }
  }

  private async updateTokenWindow(usage: Usage) {
    const { windowSeconds, windowTokens } = env.rateLimit
    if (!windowSeconds || !windowTokens) return

    const newTokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
    const now = new Date()
    const nowStr = now.toISOString()
    // ISO 8601 strings are lexicographically comparable — window has expired if windowStart < cutoff
    const cutoff = new Date(now.getTime() - windowSeconds * 1000).toISOString()

    await db
      .insertInto('UserTokenWindow')
      .values({
        userId: this.session.userId,
        tokenWindowStart: nowStr,
        tokenWindowAccumulated: newTokens,
      })
      .onConflict((oc) =>
        oc.column('userId').doUpdateSet((eb) => ({
          tokenWindowAccumulated: sql<number>`case when ${eb.ref('UserTokenWindow.tokenWindowStart')} < ${cutoff} then ${newTokens} else ${eb.ref('UserTokenWindow.tokenWindowAccumulated')} + ${newTokens} end`,
          tokenWindowStart: sql<string>`case when ${eb.ref('UserTokenWindow.tokenWindowStart')} < ${cutoff} then ${nowStr} else ${eb.ref('UserTokenWindow.tokenWindowStart')} end`,
        }))
      )
      .execute()
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
      tokenDetails: null,
      sentAt: message.sentAt,
      errors: null,
    }
  }
}
