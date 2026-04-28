import { beforeEach, describe, expect, test, vi } from 'vitest'
import type * as dto from '@/types/dto'
import { MessageAuditor } from '@/lib/MessageAuditor'
import type * as schema from '@/db/schema'

const insertedRows: schema.MessageAudit[] = []

vi.mock('@/lib/logging', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/db/database', () => ({
  db: {
    insertInto: vi.fn(() => ({
      values(value: schema.MessageAudit) {
        insertedRows.push(value)
        return {
          execute: vi.fn().mockResolvedValue(undefined),
        }
      },
    })),
  },
}))

const makeConversation = () =>
  ({
    conversation: {
      id: 'conversation-1',
      assistantId: 'assistant-1',
    },
    assistant: {
      model: 'claude-sonnet-4-6',
    },
  }) as any

const makeUserMessage = (): dto.UserMessage =>
  ({
    id: 'user-1',
    role: 'user',
    content: 'hello',
    attachments: [],
    parts: [],
    conversationId: 'conversation-1',
    sentAt: '2026-04-02T16:00:00.000Z',
    parent: null,
  }) as dto.UserMessage

const makeToolMessage = (): dto.ToolMessage =>
  ({
    id: 'tool-1',
    role: 'tool',
    conversationId: 'conversation-1',
    sentAt: '2026-04-02T16:00:01.000Z',
    parent: 'assistant-1',
    parts: [],
  }) as dto.ToolMessage

const makeAssistantMessage = (): dto.AssistantMessage =>
  ({
    id: 'assistant-1',
    role: 'assistant',
    conversationId: 'conversation-1',
    sentAt: '2026-04-02T16:00:02.000Z',
    parent: 'user-1',
    parts: [],
  }) as dto.AssistantMessage

describe('MessageAuditor', () => {
  beforeEach(() => {
    insertedRows.length = 0
  })

  test('writes input tokens to the pending user row and output tokens to the assistant row', async () => {
    const auditor = new MessageAuditor(makeConversation(), {
      userId: 'user-123',
      userRole: 'USER',
    } as any)

    await auditor.auditMessage(makeUserMessage())
    expect(insertedRows).toEqual([])

    await auditor.auditMessage(makeAssistantMessage(), {
      totalTokens: 21,
      inputTokens: 13,
      outputTokens: 8,
    })

    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]).toMatchObject({
      messageId: 'user-1',
      type: 'user',
      tokens: 13,
    })
    expect(insertedRows[1]).toMatchObject({
      messageId: 'assistant-1',
      type: 'assistant',
      tokens: 8,
    })
  })

  test('attributes tool results as input tokens for the following assistant turn', async () => {
    const auditor = new MessageAuditor(makeConversation(), {
      userId: 'user-123',
      userRole: 'USER',
    } as any)

    await auditor.auditMessage(makeToolMessage())
    expect(insertedRows).toEqual([])

    await auditor.auditMessage(makeAssistantMessage(), {
      totalTokens: 9,
      inputTokens: 6,
      outputTokens: 3,
    })

    expect(insertedRows).toHaveLength(2)
    expect(insertedRows[0]).toMatchObject({
      messageId: 'tool-1',
      type: 'tool',
      tokens: 6,
    })
    expect(insertedRows[1]).toMatchObject({
      messageId: 'assistant-1',
      type: 'assistant',
      tokens: 3,
    })
  })

  test('still records assistant rows when no usage is available', async () => {
    const auditor = new MessageAuditor(makeConversation(), {
      userId: 'user-123',
      userRole: 'USER',
    } as any)

    await auditor.auditMessage(makeAssistantMessage())

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      messageId: 'assistant-1',
      type: 'assistant',
      tokens: 0,
    })
  })
})
